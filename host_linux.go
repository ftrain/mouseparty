package main

import (
	"context"
	"os/exec"
)

// toolWrap (Linux): MediaMTX and cloudflared in a bubblewrap box, like the
// viewer site (bubblewrap_linux.go) — and like it, mandatory: no bubblewrap, no
// tool, never a tool without its box. MediaMTX reads the session's config and
// stand-by stream at their real paths, and writes certificates in a private
// cwd. Both tools need the resolver as well as the host's network; cloudflared
// also needs CA bundles for TLS, but does not see the session folder.
func (h *Host) toolWrap(name, bin string, args []string) (*exec.Cmd, error) {
	if sandboxOff.Load() {
		return exec.Command(bin, args...), nil
	}
	tool := "/app/" + name
	mounts := []string{"--ro-bind", bin, tool, "--ro-bind-try", "/etc/resolv.conf", "/etc/resolv.conf"}
	chdir := ""
	switch name {
	case "mediamtx":
		chdir = "/mtx-state"
		mounts = append(mounts, "--tmpfs", chdir)
		if h.tmp != "" {
			// The parent rewrites files here on retries; the tool must not be
			// able to replace them (for example, with symlinks).
			mounts = append(mounts, "--ro-bind", h.tmp, h.tmp)
		}
	case "cloudflared":
		for _, path := range linuxCABundles {
			mounts = append(mounts, "--ro-bind-try", path, path)
		}
	}
	return bubblewrapCommand(context.Background(), name, true, chdir, mounts, append([]string{tool}, args...)...)
}

// Go's crypto/x509 bundle paths on Linux, not the directories that hold them.
var linuxCABundles = [...]string{
	"/etc/ssl/certs/ca-certificates.crt",
	"/etc/pki/tls/certs/ca-bundle.crt",
	"/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem",
	"/etc/ssl/ca-bundle.pem",
	"/etc/ssl/cert.pem",
}
