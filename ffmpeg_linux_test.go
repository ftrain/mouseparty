package main

import (
	"bytes"
	"errors"
	"flag"
	"image/png"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

func requireLinuxBubblewrap(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Skip("needs bubblewrap")
	}
}

// Exercise the actual launcher with a child that can explicitly test each grant.
func TestLinuxOfflineFFmpegIsolation(t *testing.T) {
	if args := flag.Args(); len(args) == 4 && args[0] == "probe-ffmpeg" {
		input, sibling, listener := args[1], args[2], args[3]
		if got, err := os.ReadFile(input); err != nil || string(got) != "selected" {
			t.Fatalf("expected the original selected inode: %q, %v", got, err)
		}
		for _, path := range []string{sibling, filepath.Join(filepath.Dir(input), filepath.Base(sibling)), "/proc/self/status"} {
			if _, err := os.ReadFile(path); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("should not see %s: %v", path, err)
			}
		}
		for _, path := range []string{input, filepath.Join(filepath.Dir(input), "new-file")} {
			if err := os.WriteFile(path, []byte("cannot write"), 0600); !errors.Is(err, unix.EROFS) {
				t.Fatalf("expected a read-only mount at %s: %v", path, err)
			}
		}
		if wd, err := os.Getwd(); err != nil || wd != "/tmp" || os.Getenv("TMPDIR") != "/tmp" {
			t.Fatalf("expected private cwd and TMPDIR: %q, %v, TMPDIR=%q", wd, err, os.Getenv("TMPDIR"))
		}
		if err := os.WriteFile("scratch", []byte("ok"), 0600); err != nil {
			t.Fatal(err)
		}
		if _, present := os.LookupEnv("MOUSEPARTY_SANDBOX_TEST_SECRET"); present {
			t.Fatal("inherited host environment")
		}
		if c, err := net.DialTimeout("tcp4", listener, time.Second); err == nil {
			c.Close()
			t.Fatal("reached unrelated host listener")
		}
		return
	}
	requireLinuxBubblewrap(t)
	t.Setenv("MOUSEPARTY_SANDBOX_TEST_SECRET", "host only")
	l, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	dir := t.TempDir()
	path, sibling := filepath.Join(dir, "chosen.mkv"), filepath.Join(dir, "sibling.mkv")
	writeFile(t, path, "selected")
	writeFile(t, sibling, "private")
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := contextTimeout(10 * time.Second)
	defer cancel()
	cmd, err := offlineFFmpegCommand(ctx, exe, path, func(input string) []string {
		return []string{"-test.run=^TestLinuxOfflineFFmpegIsolation$", "--", "probe-ffmpeg", input, sibling, l.Addr().String()}
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range cmd.ExtraFiles {
		defer f.Close()
	}
	// Replacing the selected name with a symlink to a directory cannot grant
	// the directory, even if the replacement happens before bwrap starts.
	if err := os.Rename(path, path+".old"); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(dir, path); err != nil {
		t.Fatal(err)
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("sandbox probe: %v\n%s", err, out)
	}
}

func TestLinuxOfflineFFmpegRequiresRegularFile(t *testing.T) {
	requireLinuxBubblewrap(t)
	root := t.TempDir()
	link, fifo := filepath.Join(root, "link"), filepath.Join(root, "fifo")
	if err := os.Symlink(root, link); err != nil {
		t.Fatal(err)
	}
	if err := unix.Mkfifo(fifo, 0600); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{root, link, fifo, "/dev/null"} {
		cmd, err := offlineFFmpegCommand(t.Context(), "/unused", path, func(input string) []string { return []string{input} })
		if cmd != nil {
			for _, f := range cmd.ExtraFiles {
				f.Close()
			}
		}
		if err == nil || !strings.Contains(err.Error(), "not a regular file") {
			t.Errorf("%s: expected regular-file rejection, got %v", path, err)
		}
	}
}

func TestLinuxOfflineFFmpegNoFallback(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PATH", dir)
	ffmpeg, bwrap := filepath.Join(dir, "ffmpeg"), filepath.Join(dir, "bwrap")
	if err := os.WriteFile(ffmpeg, []byte("#!/bin/sh\nprintf 'ran directly'\n"), 0700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "chosen.mkv")
	writeFile(t, path, "selected")
	run := func() ([]byte, error) {
		return offlineFFmpeg(t.Context(), path, (*exec.Cmd).CombinedOutput, nil, "pipe:1")
	}
	if out, err := run(); !errors.Is(err, exec.ErrNotFound) || len(out) != 0 {
		t.Fatalf("expected missing bubblewrap: %q, %v", out, err)
	}
	h := &Host{clock: &clock{"test", 0.25, time.Now()}}
	h.SetShowing(path, "Clip")
	if out, _, err := h.Frame(); !errors.Is(err, exec.ErrNotFound) || len(out) != 0 {
		t.Fatalf("Host.Frame must require bubblewrap: %q, %v", out, err)
	}
	if err := os.WriteFile(bwrap, []byte("#!/bin/sh\nprintf 'sandbox setup failed' >&2\nexit 1\n"), 0700); err != nil {
		t.Fatal(err)
	}
	if out, err := run(); err == nil || string(out) != "sandbox setup failed" {
		t.Fatalf("expected sandbox failure, no retry: %q, %v", out, err)
	}
	unboxed(t)
	if out, err := run(); err != nil || string(out) != "ran directly" {
		t.Fatalf("expected explicit no_sandbox to work: %q, %v", out, err)
	}
}

func TestLinuxOfflineFFmpegMedia(t *testing.T) {
	requireLinuxBubblewrap(t)
	ffmpeg := findTool("ffmpeg")
	if ffmpeg == "" {
		t.Skip("needs ffmpeg")
	}
	dir := t.TempDir()
	clip, srt := filepath.Join(dir, "clip.mkv"), filepath.Join(dir, "subtitles.srt")
	writeFile(t, srt, "1\n00:00:00,200 --> 00:00:01,000\nA subtitle\n")
	if out, err := exec.Command(ffmpeg, "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=80x48:r=5:d=2",
		"-i", srt, "-c:v", "libx264", "-c:s", "copy", clip).CombinedOutput(); err != nil {
		t.Fatalf("make clip: %v\n%s", err, out)
	}
	link := filepath.Join(dir, "linked movie.mkv")
	if err := os.Symlink(clip, link); err != nil {
		t.Fatal(err)
	}
	if m := inspect(link); m.Error != "" || m.Duration != 2 || len(m.of("Video")) != 1 || len(m.of("Subtitle")) != 1 {
		t.Fatalf("inspect: %+v", m)
	}
	h := &Host{clock: &clock{"test", 0.25, time.Now()}}
	h.SetShowing(link, "Blue")
	data, pic, err := h.Frame()
	if err != nil || pic.W != 80 || pic.H != 48 || pic.Title != "Blue" {
		t.Fatalf("Host.Frame: %+v, %v", pic, err)
	}
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	r, g, b, _ := img.At(40, 24).RGBA()
	if b < 60000 || r > 5000 || g > 5000 {
		t.Fatalf("expected a blue frame, RGB = %d,%d,%d", r, g, b)
	}
	for _, track := range []Track{{Kind: "file", Text: true, Path: srt}, {Kind: "embedded", Text: true, Index: 0}} {
		if got := cues(track, link, 0.5); len(got) != 1 || got[0].Start != 0.7 || got[0].End != 1.5 || got[0].Text != "A subtitle" {
			t.Errorf("%s WebVTT cues: %+v", track.Kind, got)
		}
	}
}

// A sound file's cover art comes out of the offline box as a PNG.
func TestLinuxExtractCover(t *testing.T) {
	requireLinuxBubblewrap(t)
	ffmpeg := findTool("ffmpeg")
	if ffmpeg == "" {
		t.Skip("needs ffmpeg")
	}
	dir := t.TempDir()
	cover, song := filepath.Join(dir, "cover.png"), filepath.Join(dir, "song.mp3")
	if out, err := exec.Command(ffmpeg, "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=32x32:d=1",
		"-frames:v", "1", cover).CombinedOutput(); err != nil {
		t.Fatalf("make cover: %v\n%s", err, out)
	}
	if out, err := exec.Command(ffmpeg, "-v", "error", "-i", cover, "-f", "lavfi", "-i", "sine=f=440:d=1",
		"-map", "0:v", "-map", "1:a", "-disposition:v", "attached_pic", "-c:a", "libmp3lame", song).CombinedOutput(); err != nil {
		t.Fatalf("make song: %v\n%s", err, out)
	}
	got := extractCover(song, 0)
	if got == "" {
		t.Fatal("no cover extracted")
	}
	t.Cleanup(func() { os.Remove(got) })
	f, err := os.Open(got)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	img, err := png.Decode(f)
	if err != nil || img.Bounds().Dx() != 32 || img.Bounds().Dy() != 32 {
		t.Fatalf("the cover, out of the box: %v, %+v", err, img)
	}
	if r, _, _, _ := img.At(16, 16).RGBA(); r < 60000 {
		t.Fatal("not the red cover")
	}
}
