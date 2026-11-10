package main

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Each program's box (sandbox.go), tried with a stand-in for the program: what a
// stranger who had taken the program over could do with it. The same rules, made
// by the same functions, around cat, ls, touch, sh and nc.
func TestBoxesKeepTheMacOut(t *testing.T) {
	if !sandboxing() {
		t.Skip("needs " + sandboxExec)
	}
	home, _ := os.UserHomeDir() // the real one: nothing here reads past its name
	dir := t.TempDir()
	secret := filepath.Join(dir, "secret.txt")
	movie := filepath.Join(dir, "movie.mkv")
	own := filepath.Join(dir, "ours.txt")
	session := filepath.Join(dir, "session")
	os.Mkdir(session, 0o700)
	for _, p := range []string{secret, movie, own, filepath.Join(session, "mediamtx.yml")} {
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

	run := func(b *box, args ...string) error {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		out, err := b.command(ctx, args...).CombinedOutput()
		if err != nil {
			return fmt.Errorf("%v: %s", err, strings.TrimSpace(string(out)))
		}
		return nil
	}
	can := func(what string, err error) {
		t.Helper()
		if err != nil {
			t.Errorf("%s should work in its box: %v", what, err)
		}
	}
	cannot := func(what string, err error) {
		t.Helper()
		if err == nil {
			t.Errorf("%s worked: the box let it", what)
		}
	}
	ffmpegArgs := []string{"-i", movie, "-f", "rtsp", fmt.Sprintf("rtsp://127.0.0.1:%d/live", mtxPort)}
	boxes := map[string]func(bin string) *box{
		"ffmpeg":      func(bin string) *box { return ffmpegBox(bin, []string{own}, ffmpegArgs) },
		"mediamtx":    func(bin string) *box { return h.boxFor("mediamtx", bin) },
		"cloudflared": func(bin string) *box { return h.boxFor("cloudflared", bin) },
		"the site":    func(bin string) *box { return siteBox(bin, h.HTTPPort, ports, nil, []string{session}) },
	}
	for name, in := range boxes {
		cannot(name+" reading a file it wasn't given", run(in("/bin/cat"), secret))
		cannot(name+" listing the home folder", run(in("/bin/ls"), home))
		cannot(name+" writing a file it wasn't given", run(in("/usr/bin/touch"), secret))
		cannot(name+" writing into the home folder", run(in("/usr/bin/touch"), filepath.Join(home, ".mouseparty-sandbox-test")))
		cannot(name+" starting another program", run(in("/bin/sh"), "-c", "/bin/ls /"))
		cannot(name+" reaching another port on this Mac", run(in("/usr/bin/nc"), "-z", "-G", "3", "127.0.0.1", fmt.Sprint(otherPort)))
		if name != "cloudflared" { // which is for exactly that, and only on Cloudflare's ports
			cannot(name+" reaching out to the internet", run(in("/usr/bin/nc"), "-z", "-G", "3", "1.1.1.1", "80"))
		}
	}
	can("ffmpeg reading its input", run(boxes["ffmpeg"]("/bin/cat"), movie))
	can("ffmpeg writing our temporary file", run(boxes["ffmpeg"]("/usr/bin/touch"), own))
	cannot("ffmpeg writing its input", run(boxes["ffmpeg"]("/usr/bin/touch"), movie))
	can("ffmpeg publishing to MediaMTX", run(boxes["ffmpeg"]("/usr/bin/nc"), "-z", "-G", "3", "127.0.0.1", fmt.Sprint(mtxPort)))
	can("MediaMTX reading its config", run(boxes["mediamtx"]("/bin/cat"), filepath.Join(session, "mediamtx.yml")))
	cannot("cloudflared reading the session's folder", run(boxes["cloudflared"]("/bin/cat"), filepath.Join(session, "mediamtx.yml")))
	can("the site asking MediaMTX", run(boxes["the site"]("/usr/bin/nc"), "-z", "-G", "3", "127.0.0.1", fmt.Sprint(mtxPort)))
	can("the site writing its own folder", run(boxes["the site"]("/usr/bin/touch"), filepath.Join(session, "read.tmp")))
}

// Subtitles burned in are drawn by libass with macOS's fonts, found through its font
// daemon: in ffmpeg's box they must come out as they do outside it, to the pixel.
func TestSubtitlesAreDrawnTheSameInTheBox(t *testing.T) {
	if findTool("ffmpeg") == "" || !sandboxing() {
		t.Skip("needs ffmpeg and " + sandboxExec)
	}
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
			"-vf", fmt.Sprintf("subtitles='%s'", filterPath(ours)), "-frames:v", "1", "-update", "1", out).CombinedOutput()
		png, _ := os.ReadFile(out)
		if err != nil || len(png) == 0 {
			t.Fatalf("%s: %v %s", name, err, said)
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
		t.Skip("needs mediamtx and " + sandboxExec)
	}
	t.Setenv("HOME", t.TempDir())
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

// unboxed: for a test whose stand-in for a tool is a shell script: nothing is sandboxed until it ends
func unboxed(t *testing.T) {
	sandboxOff.Store(true)
	t.Cleanup(func() { sandboxOff.Store(false) })
}
