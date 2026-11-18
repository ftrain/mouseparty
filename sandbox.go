package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
)

const boxArg = "--box"

var (
	sandboxOff  atomic.Bool // the party file's "no_sandbox" (config.go)
	sandboxNone sync.Once   // said once, when this macOS has no sandbox-exec
	sandboxSaid sync.Once
	sandboxLog  = func(line string) { fmt.Fprintln(os.Stderr, line) }
)

// sandboxing: programs are run in their boxes
func sandboxing() bool {
	if sandboxOff.Load() {
		return false
	}
	if why := sandboxMissing(); why != "" {
		sandboxNone.Do(func() { sandboxLog(why + ": running without the sandbox.") })
		return false
	}
	sandboxSaid.Do(func() {
		if note := sandboxLimits(); note != "" {
			sandboxLog(note)
		}
	})
	return true
}

func (b *box) command(ctx context.Context, args ...string) *exec.Cmd {
	bin, argv := b.argv(args...)
	var cmd *exec.Cmd
	if ctx == nil {
		cmd = exec.Command(bin, argv...)
	} else {
		cmd = exec.CommandContext(ctx, bin, argv...)
	}
	if cmd.Cancel != nil {
		cmd.Cancel = func() error {
			killBoxed(cmd)
			return nil
		}
	}
	noConsole(cmd)
	return cmd
}

// realPath: the path the system knows a file by (the sandbox matches on that: /var is /private/var),
// whether or not the file is there yet
func realPath(path string) string {
	if abs, err := filepath.Abs(path); err == nil {
		path = abs
	}
	if p, err := filepath.EvalSymlinks(path); err == nil {
		return p
	}
	if dir, err := filepath.EvalSymlinks(filepath.Dir(path)); err == nil {
		return filepath.Join(dir, filepath.Base(path))
	}
	return path
}

// ---------- ffmpeg ----------

// ffmpegCmd: ffmpeg with args, in its box: it reads the files it's given as inputs
// (-i) and nothing else of the Mac's, reads and writes own (temporary files the app
// made for it: a card's words, a cover to fill), and reaches only the port it
// publishes to (an rtsp:// on this Mac among args). A file it reads may be a
// stranger's (a download), and it is the one big parser of them here that isn't
// memory-safe: this is what it can do if one gets the better of it.
func ffmpegCmd(ctx context.Context, own []string, args ...string) *exec.Cmd {
	return ffmpegBox(firstTool("ffmpeg"), own, args).command(ctx, args...)
}

func ffmpegBox(bin string, own, args []string) *box {
	b := newBox(bin)
	for i, a := range args {
		if i > 0 && args[i-1] == "-i" {
			if _, err := os.Stat(a); err == nil || filepath.IsAbs(a) { // a file, not a source ffmpeg makes up (lavfi)
				b.read(a)
			}
		}
		if port, ok := strings.CutPrefix(a, "rtsp://127.0.0.1:"); ok {
			port, _, _ = strings.Cut(port, "/")
			if n, err := strconv.Atoi(port); err == nil && isDigits(port) {
				b.reachLocal(n)
			}
		}
	}
	return b.write(own...).fonts()
}

func isDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return s != ""
}
