package main

import (
	"context"
	"fmt"
	"os/exec"
)

// Shared Linux boundary. Callers choose the mounts, the working directory and
// whether the host's network stays, for their role; none are inferred from the
// command line.
func bubblewrapArgv(role string, net bool, chdir string, mounts []string, command ...string) (string, []string, error) {
	bin, err := exec.LookPath("bwrap")
	if err != nil {
		return "", nil, fmt.Errorf("Linux %s sandbox needs bubblewrap: %w", role, err)
	}
	if chdir == "" {
		chdir = "/tmp"
	}
	args := []string{"--unshare-all", "--unshare-user", "--disable-userns", "--cap-drop", "ALL", "--die-with-parent", "--new-session"}
	if net {
		// A listener or an outbound stream needs the host's network — and with
		// it whatever else is on it: bubblewrap has no per-port rule, where the
		// macOS boxes name the ports they allow. Everything else stays unshared.
		args = append(args, "--share-net")
	}
	args = append(args, "--dev", "/dev", "--tmpfs", "/tmp", "--chdir", chdir, "--setenv", "TMPDIR", "/tmp")
	// The ELF loader and the distribution's shared libraries (also for Wails).
	for _, lib := range []string{"/lib", "/lib64", "/usr/lib", "/usr/lib64", "/etc/ld.so.cache", "/etc/alternatives"} {
		args = append(args, "--ro-bind-try", lib, lib)
	}
	args = append(args, mounts...)
	return bin, append(args, append([]string{"--"}, command...)...), nil
}

func bubblewrapCommand(ctx context.Context, role string, shareNet bool, chdir string, mounts []string, command ...string) (*exec.Cmd, error) {
	bin, args, err := bubblewrapArgv(role, shareNet, chdir, mounts, command...)
	if err != nil {
		return nil, err
	}
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = []string{} // no host tokens, display, preload or proxy settings
	return cmd, nil
}
