package main

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// Each program's box (sandbox.go), tried with a stand-in for the program: what a
// stranger who had taken the program over could do with it. The same rules, made
// by the same functions, around this test's own program as a probe (probeMain),
// which does the one thing it's asked and says whether the box refused it.
func TestBoxesKeepTheMacOut(t *testing.T) {
	if !sandboxing() {
		t.Skip("needs the sandbox")
	}
	if runtime.GOOS == "windows" {
		t.Skip("Windows's box keeps a program from writing and from starting programs, not from reading or the network: box_windows_test.go tries it")
	}
	probe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	home, _ := os.UserHomeDir() // the real one: nothing here reads past its name
	dir := t.TempDir()
	secret := filepath.Join(dir, "secret.txt")
	movie := filepath.Join(dir, "movie.mkv")
	own := filepath.Join(dir, "ours.txt")
	session := filepath.Join(dir, "session")
	config, loop := filepath.Join(session, mediamtxYML), filepath.Join(session, standbyMP4)
	if err := os.MkdirAll(mediamtxDir(session), 0o700); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{secret, movie, own, config, loop} {
		if err := os.WriteFile(p, []byte("x\n"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	served := func() (*httptest.Server, int) {
		s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "hello") }))
		t.Cleanup(s.Close)
		return s, s.Listener.Addr().(*net.TCPAddr).Port
	}
	_, mtxPort := served()   // stands for MediaMTX's API
	_, otherPort := served() // and for anything else listening on this Mac
	h := &Host{HTTPPort: freePort(), ICEPort: freePort(), tmp: session}
	ports := map[string]int{"api": mtxPort, "hls": freePort(), "webrtc": freePort(), "rtsp": otherPort}

	run := func(b *box, args ...string) (int, string) {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		out, err := b.command(ctx, append([]string{probeArg}, args...)...).CombinedOutput()
		said := strings.TrimSpace(string(out))
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			return exit.ExitCode(), said
		}
		if err != nil {
			return -1, err.Error()
		}
		return probeDid, said
	}
	can := func(what string, b *box, args ...string) {
		t.Helper()
		if code, said := run(b, args...); code != probeDid {
			t.Errorf("%s should work in its box: %d %s", what, code, said)
		}
	}
	cannot := func(what string, b *box, args ...string) {
		t.Helper()
		switch code, said := run(b, args...); code {
		case probeRefused:
		case probeDid:
			t.Errorf("%s worked: the box let it", what)
		default:
			t.Errorf("%s wasn't refused by the box, it failed: %d %s", what, code, said)
		}
	}
	outside := func(args ...string) {
		t.Helper()
		if out, err := exec.Command(probe, append([]string{probeArg}, args...)...).CombinedOutput(); err != nil {
			t.Fatalf("outside any box the probe can't %s either: %v %s", args[0], err, out)
		}
	}
	type change struct{ op, what string }
	changes := []change{{"times", "touching it"}, {"chmod", "changing its mode"}, {"chown", "changing its owner"}}
	if runtime.GOOS == "linux" {
		changes = append(changes, change{"xattr", "setting an extended attribute on it"})
	}
	for _, c := range changes {
		outside(c.op, secret)
	}
	untouched := func(what string, b *box, path string) {
		t.Helper()
		cannot(what, b, "write", path)
		for _, c := range changes {
			cannot(what+", "+c.what, b, c.op, path)
		}
	}
	touch := "times"
	if runtime.GOOS == "linux" {
		touch = "futimens"
	}
	portsBoxed := runtime.GOOS != "linux" || sandboxLimits() == ""
	if !portsBoxed {
		t.Log(sandboxLimits(), "Reaching the ports it wasn't given isn't tried here.")
	}
	local := func(port int) string { return fmt.Sprintf("127.0.0.1:%d", port) }

	ffmpegArgs := []string{"-i", movie, "-f", "rtsp", fmt.Sprintf("rtsp://127.0.0.1:%d/live", mtxPort)}
	boxes := map[string]*box{
		"ffmpeg":      ffmpegBox(probe, []string{own}, ffmpegArgs),
		"mediamtx":    h.boxFor("mediamtx", probe),
		"cloudflared": h.boxFor("cloudflared", probe),
		"the site":    siteBox(probe, h.HTTPPort, ports, nil, []string{session}),
	}
	for name, b := range boxes {
		cannot(name+" reading a file it wasn't given", b, "read", secret)
		cannot(name+" listing the home folder", b, "list", home)
		untouched(name+" writing a file it wasn't given", b, secret)
		cannot(name+" writing into the home folder", b, "write", filepath.Join(home, ".mouseparty-sandbox-test"))
		cannot(name+" starting another program", b, "exec", "/bin/sh", "-c", "/bin/ls /")
		if portsBoxed {
			cannot(name+" reaching another port on this Mac", b, "dial", local(otherPort))
			if name != "cloudflared" { // which is for exactly that, and only on Cloudflare's ports
				cannot(name+" reaching out to the internet", b, "dial", "1.1.1.1:80")
			}
		}
	}
	mtxFile, siteFile := filepath.Join(mediamtxDir(session), "made.tmp"), filepath.Join(session, "read.tmp")
	can("ffmpeg reading its input", boxes["ffmpeg"], "read", movie)
	can("ffmpeg writing our temporary file", boxes["ffmpeg"], "write", own)
	can("ffmpeg touching our temporary file", boxes["ffmpeg"], touch, own)
	untouched("ffmpeg writing its input", boxes["ffmpeg"], movie)
	can("ffmpeg publishing to MediaMTX", boxes["ffmpeg"], "dial", local(mtxPort))
	can("MediaMTX reading its config", boxes["mediamtx"], "read", config)
	can("MediaMTX reading the stand-by video", boxes["mediamtx"], "read", loop)
	can("MediaMTX writing its own folder", boxes["mediamtx"], "write", mtxFile)
	can("MediaMTX touching what it wrote", boxes["mediamtx"], touch, mtxFile)
	if runtime.GOOS != "darwin" {
		untouched("MediaMTX writing its config, outside its own folder", boxes["mediamtx"], config)
	}
	cannot("cloudflared reading the session's folder", boxes["cloudflared"], "read", config)
	can("the site asking MediaMTX", boxes["the site"], "dial", local(mtxPort))
	can("the site writing its own folder", boxes["the site"], "write", siteFile)
	can("the site touching what it wrote", boxes["the site"], touch, siteFile)
	if runtime.GOOS == "linux" {
		outside("keyctl")
		outside("shmget")
		for name, b := range boxes {
			cannot(name+" making namespaces of its own", b, "userns")
			cannot(name+" setting up io_uring", b, "iouring")
			cannot(name+" opening an MPTCP socket", b, "mptcp")
			cannot(name+" opening an ICMP socket", b, "icmp")
			cannot(name+" using the kernel's keyrings", b, "keyctl")
			cannot(name+" using System V shared memory", b, "shmget")
			if name != "mediamtx" {
				cannot(name+" asking the kernel through netlink", b, "netlink")
			}
		}
		can("MediaMTX asking the kernel through netlink for this computer's addresses", boxes["mediamtx"], "netlink")
	}
}

// Subtitles burned in are drawn by libass with the system's fonts (macOS's through
// its font daemon, Linux's through fontconfig): in ffmpeg's box they must come out
// as they do outside it, to the pixel. Fontconfig making its cache for the first
// time, in the box, has nothing to say about it.
func TestSubtitlesAreDrawnTheSameInTheBox(t *testing.T) {
	if findTool("ffmpeg") == "" || !sandboxing() {
		t.Skip("needs ffmpeg and the sandbox")
	}
	tempHome(t)
	dir := t.TempDir()
	clip, srt := filepath.Join(dir, "clip.mkv"), filepath.Join(dir, "subs.srt")
	if out, err := exec.Command(findTool("ffmpeg"), "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=640x360:r=30:d=3", clip).CombinedOutput(); err != nil {
		t.Fatal(err, string(out))
	}
	os.WriteFile(srt, []byte("1\n00:00:00,000 --> 00:00:03,000\nHello from the box: café, naïve\n"), 0o600)
	shot := func(name string) [32]byte {
		ours, err := offsetSRT(srt, 0)
		if err != nil {
			t.Fatal(err)
		}
		defer os.Remove(ours)
		out := filepath.Join(dir, name+".png")
		os.WriteFile(out, nil, 0o600)
		said, err := ffmpegCmd(context.Background(), []string{ours, out}, "-v", "error", "-y", "-ss", "1", "-i", clip,
			"-vf", "subtitles=filename="+filterValue(ours), "-frames:v", "1", "-update", "1", out).CombinedOutput()
		png, _ := os.ReadFile(out)
		if err != nil || len(png) == 0 {
			t.Fatalf("%s: %v %s", name, err, said)
		}
		if strings.Contains(string(said), "Fontconfig") {
			t.Errorf("%s: %s", name, said)
		}
		return sha256.Sum256(png)
	}
	blank := filepath.Join(dir, "blank.png")
	exec.Command(findTool("ffmpeg"), "-v", "error", "-y", "-ss", "1", "-i", clip, "-frames:v", "1", "-update", "1", blank).Run()
	none, _ := os.ReadFile(blank)
	boxed := shot("boxed")
	unboxed(t)
	if plain := shot("plain"); boxed != plain {
		t.Fatal("the subtitles are drawn differently in the box")
	} else if plain == sha256.Sum256(none) {
		t.Fatal("no subtitles were drawn at all")
	}
}

// A host as the app starts one: the site in a process of its own, boxed, told what's up
// and handed the file; killed, it comes back on the same link knowing what was up.
func TestTheSiteInItsOwnProcess(t *testing.T) {
	if findTool("mediamtx") == "" || !sandboxing() {
		t.Skip("needs mediamtx and the sandbox")
	}
	tempHome(t)
	var went []string
	h := NewHost(func(s string) { t.Log(s) }, firstTool("mediamtx"), "", standby)
	h.HTTPPort, h.ICEPort, h.MapPorts, h.CleanLeftovers, h.Sandbox = freePort(), freeICEPort(), false, false, true
	h.DocPages = func(pages int) { went = append(went, fmt.Sprint("pages ", pages)) }
	if err := h.Start(); err != nil {
		t.Fatal(err)
	}
	defer h.Stop()
	if h.chat != nil || h.site == nil {
		t.Fatal("the site is part of this process")
	}
	base := h.URLs()["lan"]
	get := func(path string) (int, string) {
		t.Helper()
		resp, err := http.Get(base + path)
		if err != nil {
			return 0, err.Error()
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, string(b)
	}
	if code, body := get(""); code != 200 || !strings.Contains(body, "<html") {
		t.Fatal("the page:", code, body)
	}
	if code, _ := get("status"); code != 200 { // which asks MediaMTX
		t.Fatal("status:", code)
	}
	pdf := filepath.Join(t.TempDir(), "a paper.pdf")
	os.WriteFile(pdf, []byte("%PDF-1.4\nonly this file\n%%EOF\n"), 0o600)
	h.SetDocument(document{Token: "t1", Path: pdf, Title: "A paper", Kind: "pdf", Pages: 3, Page: 1})
	h.SetPage(2)
	if code, body := get("doc/t1"); code != 200 || !strings.Contains(body, "only this file") {
		t.Fatal("the PDF, from the file handed over:", code, body)
	}
	if _, body := get("status"); !strings.Contains(body, `"page":2`) || strings.Contains(body, filepath.Dir(pdf)) {
		t.Fatal("what's up, without where it is:", body)
	}

	old := h.site
	old.cmd.Process.Kill() // a crash
	for end := time.Now().Add(20 * time.Second); ; time.Sleep(100 * time.Millisecond) {
		h.mu.Lock()
		back := h.site != nil && h.site != old
		h.mu.Unlock()
		if back {
			break
		}
		if time.Now().After(end) {
			t.Fatal("the site didn't come back")
		}
	}
	if code, body := get("doc/t1"); code != 200 || !strings.Contains(body, "only this file") {
		t.Fatal("the PDF, after the site came back:", code, body)
	}
	if _, body := get("status"); !strings.Contains(body, `"page":2`) {
		t.Fatal("the page everyone was on, after the site came back:", body)
	}
	h.ClearDocument()
	if code, _ := get("doc/t1"); code != 404 {
		t.Fatal("a document taken down is still served:", code)
	}
}

// Stopped while it was still starting (the app quitting as hosting comes up), a host starts
// nothing more: no site, nothing of one written wherever the app is, no tool, and the site's
// port is let go. Stop takes the session's folder first and the key last.
func TestAHostStoppedWhileStartingStartsNothingMore(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	h := &Host{HTTPPort: freePort(), key: "k3y", urls: map[string]string{}}
	if err := h.startSite(); err == nil {
		t.Error("a site was started for a host that had stopped")
	}
	if _, err := h.spawn("mediamtx", "/bin/true"); err == nil {
		t.Error("a tool was started for a host that had stopped")
	}
	if left, _ := os.ReadDir(dir); len(left) > 0 {
		t.Errorf("left %v where the app was", left)
	}
	l, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", h.HTTPPort))
	if err != nil {
		t.Fatal("the site's port is still held:", err)
	}
	l.Close()
}

// unboxed: for a test whose stand-in for a tool is a shell script: nothing is sandboxed until it ends
func unboxed(t *testing.T) {
	sandboxOff.Store(true)
	t.Cleanup(func() { sandboxOff.Store(false) })
}
