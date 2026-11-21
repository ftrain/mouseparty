package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"golang.org/x/sys/unix"
)

func offlineFFmpegCommand(ctx context.Context, bin, path string, args func(string) []string) (*exec.Cmd, error) {
	if sandboxOff.Load() {
		return exec.CommandContext(ctx, bin, args(path)...), nil
	}
	// Keep the extension for formats that ffmpeg recognizes by name. The
	// selected path itself never appears in the mount arguments or ffmpeg argv.
	input := "/input/selected" + filepath.Ext(path)
	cmd, err := bubblewrapCommand(ctx, "offline ffmpeg", []string{
		"--ro-bind", bin, "/app/ffmpeg", "--ro-bind-fd", "3", input, "--remount-ro", "/",
	}, append([]string{"/app/ffmpeg"}, args(input)...)...)
	if err != nil {
		return nil, err
	}
	f, err := pinRegularFile(path)
	if err != nil {
		return nil, fmt.Errorf("selected media: %w", err)
	}
	cmd.ExtraFiles = []*os.File{f} // bwrap consumes fd 3 during setup; caller closes its copy
	return cmd, nil
}

func pinRegularFile(path string) (*os.File, error) {
	// O_PATH does not open a device or wait for a FIFO. Check the exact inode
	// we hand bwrap, never stat a name and then let bwrap open it again.
	fd, err := unix.Open(path, unix.O_PATH|unix.O_CLOEXEC, 0)
	if err != nil {
		return nil, fmt.Errorf("open %q: %w", path, err)
	}
	f := os.NewFile(uintptr(fd), path)
	st, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	if !st.Mode().IsRegular() {
		f.Close()
		return nil, fmt.Errorf("%q is not a regular file", path)
	}
	return f, nil
}
