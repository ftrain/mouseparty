package main

import (
	"crypto/x509"
	"errors"
	"flag"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

func probeHostNetwork(t *testing.T, listener string) {
	t.Helper()
	c, err := net.DialTimeout("tcp4", listener, time.Second)
	if err != nil {
		t.Fatalf("expected to reach the host listener %s: %v", listener, err)
	}
	c.Close()
}

// Exercise the actual tool launch policy with a child that tests each grant.
// MediaMTX and cloudflared themselves are not needed: the test binary stands in
// for each, wrapped exactly as the tool would be.
func TestLinuxToolBoxes(t *testing.T) {
	if args := flag.Args(); len(args) == 6 && args[0] == "probe-tool" {
		role, listener, resolv, ca, config := args[1], args[2], args[3], args[4], args[5]
		probeHostNetwork(t, listener)
		if _, present := os.LookupEnv("MOUSEPARTY_SANDBOX_TEST_SECRET"); present {
			t.Fatal("inherited host environment")
		}
		if resolv == "true" {
			if _, err := os.ReadFile("/etc/resolv.conf"); err != nil {
				t.Fatalf("the resolver's configuration: %v", err)
			}
		}
		switch role {
		case "mediamtx":
			if got, err := os.ReadFile(config); err != nil || string(got) != "config" {
				t.Fatalf("expected config at its original path: %q, %v", got, err)
			}
			if err := os.WriteFile(filepath.Join(filepath.Dir(config), "certificates"), []byte("ok"), 0600); !errors.Is(err, unix.EROFS) {
				t.Fatalf("the session folder should be read-only: %v", err)
			}
			if wd, err := os.Getwd(); err != nil || wd != "/mtx-state" {
				t.Fatalf("expected a private working directory: %q, %v", wd, err)
			}
			if err := os.WriteFile("certificates", []byte("ok"), 0600); err != nil {
				t.Fatalf("the private cwd should be writable: %v", err)
			}
		case "cloudflared":
			if _, err := os.Stat(config); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("cloudflared should not see the session's folder: %v", err)
			}
			if ca == "true" {
				if pool, err := x509.SystemCertPool(); err != nil || pool == nil || pool.Equal(x509.NewCertPool()) {
					t.Fatalf("expected a non-empty system CA pool: %v", err)
				}
			}
		}
		return
	}
	requireLinuxBubblewrap(t)
	t.Setenv("MOUSEPARTY_SANDBOX_TEST_SECRET", "host only")
	session := t.TempDir()
	config := filepath.Join(session, "mediamtx.yml")
	writeFile(t, config, "config")
	l, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	h := &Host{tmp: session}
	regular := func(path string) bool {
		st, err := os.Stat(path)
		return err == nil && st.Mode().IsRegular()
	}
	resolv := strconv.FormatBool(regular("/etc/resolv.conf"))
	ca := strconv.FormatBool(slices.ContainsFunc(linuxCABundles[:], regular))
	for _, role := range []string{"mediamtx", "cloudflared"} {
		t.Run(role, func(t *testing.T) {
			cmd, err := h.toolWrap(role, exe, []string{
				"-test.run=^TestLinuxToolBoxes$", "--", "probe-tool", role, l.Addr().String(), resolv, ca, config,
			})
			if err != nil {
				t.Fatal(err)
			}
			if out, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("sandbox probe: %v\n%s", err, out)
			}
		})
	}
}

// A missing bubblewrap is a failure, never a tool run without its box.
func TestLinuxToolsRequireBubblewrap(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	h := &Host{tmp: t.TempDir()}
	for _, name := range []string{"mediamtx", "cloudflared"} {
		if _, err := h.toolWrap(name, "/bin/true", nil); !errors.Is(err, exec.ErrNotFound) {
			t.Errorf("%s: expected missing bubblewrap, got %v", name, err)
		}
	}
	if _, err := h.spawn("mediamtx", "/bin/true", "unused"); !errors.Is(err, exec.ErrNotFound) {
		t.Errorf("spawn: expected missing bubblewrap, got %v", err)
	}
}

// The publishing ffmpeg's box: the inputs and the app's own files by their
// pinned inodes, no writable host files, the host's network for the stream out.
func TestLinuxPublishFFmpegIsolation(t *testing.T) {
	if args := flag.Args(); len(args) >= 6 && args[0] == "probe-publish" {
		input, second, sibling, own, listener := args[1], args[2], args[3], args[4], args[5]
		for path, want := range map[string]string{input: "selected", second: "second input", own: "ours"} {
			if got, err := os.ReadFile(path); err != nil || string(got) != want {
				t.Fatalf("expected pinned file %s: %q, %v", path, got, err)
			}
			if err := os.WriteFile(path, []byte("cannot write"), 0600); !errors.Is(err, unix.EROFS) {
				t.Fatalf("expected a read-only mount at %s: %v", path, err)
			}
		}
		if _, err := os.ReadFile(sibling); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("should not see a sibling of the pinned files: %v", err)
		}
		probeHostNetwork(t, listener)
		return
	}
	requireLinuxBubblewrap(t)
	dir := t.TempDir()
	input, sibling, own, second := filepath.Join(dir, "movie.mkv"), filepath.Join(dir, "sibling.mkv"),
		filepath.Join(dir, "words.txt"), filepath.Join(dir, "card.png")
	for path, data := range map[string]string{input: "selected", sibling: "private", own: "ours", second: "second input"} {
		writeFile(t, path, data)
	}
	l, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := contextTimeout(10 * time.Second)
	defer cancel()
	cmd, err := publishFFmpegCommand(ctx, exe, []string{own, second}, []string{
		"-test.run=^TestLinuxPublishFFmpegIsolation$", "--", "probe-publish", input, second, sibling, own, l.Addr().String(),
		"-i", input, "-i", second,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer closeExtra(cmd)
	if got := len(cmd.ExtraFiles); got != 3 {
		t.Fatalf("expected three unique pinned files, got %d", got)
	}
	// Replacing the input's name with a symlink to its folder cannot grant the
	// folder, even before bwrap has started: the descriptor holds the inode.
	if err := os.Rename(input, input+".old"); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(dir, input); err != nil {
		t.Fatal(err)
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("sandbox probe: %v\n%s", err, out)
	}
}

func TestLinuxPublishFFmpegRequiresRegularFile(t *testing.T) {
	dir := t.TempDir()
	movie, link, fifo := filepath.Join(dir, "movie.mkv"), filepath.Join(dir, "link"), filepath.Join(dir, "fifo")
	writeFile(t, movie, "selected")
	if err := os.Symlink(dir, link); err != nil {
		t.Fatal(err)
	}
	if err := unix.Mkfifo(fifo, 0600); err != nil {
		t.Fatal(err)
	}
	t.Chdir(dir)
	reject := func(own []string, args []string, want string) {
		t.Helper()
		cmd, err := publishFFmpegCommand(t.Context(), "/unused", own, args)
		if cmd != nil {
			closeExtra(cmd)
		}
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("args %q, own %q: expected %q, got %v", args, own, want, err)
		}
	}
	for _, path := range []string{dir, link, fifo, "/dev/null"} {
		reject(nil, []string{"-i", movie, "-i", path}, "not a regular file")
		reject([]string{path}, []string{"-i", movie}, "not a regular file")
	}
	missing := filepath.Join(dir, "missing")
	reject(nil, []string{"-i", movie, "-i", missing}, "open ")
	reject([]string{missing}, []string{"-i", movie}, "open ")
	reject(nil, []string{"-i", "movie.mkv"}, "expected an absolute path")
	reject(nil, []string{"-i", "missing"}, "expected an absolute path")
}

func TestLinuxPlayerStopsGracefully(t *testing.T) {
	requireLinuxBubblewrap(t)
	if findTool("ffmpeg") == "" {
		t.Skip("needs ffmpeg")
	}
	progress, exited := make(chan struct{}, 1), make(chan int, 1)
	p := &Player{
		Log: func(s string) { t.Log(s) },
		OnPosition: func(float64) {
			select {
			case progress <- struct{}{}:
			default:
			}
		},
		OnExit: func(code int) { exited <- code },
	}
	if err := p.Start([]string{"-re", "-f", "lavfi", "-i", "color=s=80x48:r=5", "-f", "null", "-"}, nil, 0, ""); err != nil {
		t.Fatal(err)
	}
	defer p.Stop()
	select {
	case <-progress:
	case code := <-exited:
		t.Fatalf("publisher exited before progress: %d", code)
	case <-time.After(10 * time.Second):
		t.Fatal("no publisher progress")
	}
	p.Stop()
	if code := <-exited; code != 0 {
		t.Fatalf("expected a graceful ffmpeg exit, got %d", code)
	}
}

// The publishing box without bubblewrap fails; no_sandbox runs it as it is.
func TestLinuxPublishFFmpegNoFallback(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PATH", dir)
	movie := filepath.Join(dir, "movie.mkv")
	writeFile(t, movie, "selected")
	bare := func() error {
		cmd, err := ffmpegCmd(t.Context(), nil, "-i", movie, "-f", "rtsp", "rtsp://127.0.0.1:1/live")
		if cmd != nil {
			closeExtra(cmd)
		}
		return err
	}
	if err := bare(); !errors.Is(err, exec.ErrNotFound) {
		t.Fatalf("expected missing bubblewrap: %v", err)
	}
	unboxed(t)
	cmd, err := ffmpegCmd(t.Context(), nil, "-i", movie)
	if err != nil {
		t.Fatal(err)
	}
	if len(cmd.Args) != 3 || cmd.Args[0] != "ffmpeg" {
		t.Fatalf("expected the bare ffmpeg: %v, %v", cmd.Args, err)
	}
}
