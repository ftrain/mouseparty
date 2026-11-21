package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

const siteFileSocket = syscall.SOCK_DGRAM

func siteSandboxing() bool           { return sandboxing() }
func restrictSite() error            { return nil }
func configureSiteMedia(*Host) error { return nil }

func siteCommand(exe string, port int, setup *SiteSetup) (*exec.Cmd, error) {
	resources := filepath.Join(filepath.Dir(exe), "..", "Resources")
	if st, err := os.Stat(resources); err != nil || !st.IsDir() {
		resources = ""
	}
	cache := wasmCacheFor(true)
	if cache != "" && os.MkdirAll(cache, 0o755) != nil {
		cache = ""
	}
	cmd := siteBox(exe, port, setup.Ports, []string{resources, setup.Pandoc, setup.Python}, []string{setup.Tmp, cache}).command(nil, siteArg)
	cmd.Dir = setup.Tmp
	cmd.Env = append(os.Environ(), "TMPDIR="+setup.Tmp)
	return cmd, nil
}
