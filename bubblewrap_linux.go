package main

import (
	"context"
	"fmt"
	"os/exec"
)

// Shared Linux boundary. Callers choose the mounts and descriptors for their
// role; none are inferred from the command line.
func bubblewrapCommand(ctx context.Context, role string, mounts []string, command ...string) (*exec.Cmd, error) {
	bin, err := exec.LookPath("bwrap")
	if err != nil {
		return nil, fmt.Errorf("Linux %s sandbox needs bubblewrap: %w", role, err)
	}
	args := []string{"--unshare-all", "--unshare-user", "--disable-userns", "--cap-drop", "ALL", "--die-with-parent", "--new-session",
		"--dev", "/dev", "--tmpfs", "/tmp", "--chdir", "/tmp", "--setenv", "TMPDIR", "/tmp"}
	// The ELF loader and the distribution's shared libraries (also for Wails).
	for _, lib := range []string{"/lib", "/lib64", "/usr/lib", "/usr/lib64", "/etc/ld.so.cache", "/etc/alternatives"} {
		args = append(args, "--ro-bind-try", lib, lib)
	}
	args = append(args, mounts...)
	cmd := exec.CommandContext(ctx, bin, append(append(args, "--"), command...)...)
	cmd.Env = []string{} // no host tokens, display, preload or proxy settings
	return cmd, nil
}
