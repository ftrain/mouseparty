package main

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestMain(m *testing.M) {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case boxArg:
			os.Exit(boxMain(os.Args[2:]))
		case thenArg:
			os.Exit(thenMain(os.Args[2:]))
		case probeArg:
			os.Exit(probeMain(os.Args[2:]))
		case siteArg: // the viewer site of a host under test, in its sandbox (site.go)
			os.Exit(siteMain())
		}
	}
	if tool := os.Getenv(fakeToolEnv); tool != "" {
		os.Exit(fakeToolMain(tool, os.Args[1:]))
	}
	os.Exit(runAtHome(m))
}

func runAtHome(m *testing.M) int {
	if os.Getenv("PLAYWRIGHT_BROWSERS_PATH") == "" { // Playwright's browsers are under the real HOME
		if cache, err := os.UserCacheDir(); err == nil {
			os.Setenv("PLAYWRIGHT_BROWSERS_PATH", filepath.Join(cache, "ms-playwright"))
		}
	}
	tmp := os.TempDir()
	home, err := os.MkdirTemp(tmp, "mouseparty-test-")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer os.RemoveAll(home)
	for name, dir := range homeEnv(home) {
		os.Setenv(name, dir)
	}
	if out := outside(tmp, keptDirs()); len(out) > 0 {
		fmt.Fprintf(os.Stderr, "not run: the tests would keep things outside %s, in %s\n", tmp, strings.Join(out, ", "))
		return 1
	}
	cardFontFile()
	hostingInTests = true
	code := m.Run()
	if windowFiles.dir != "" {
		os.RemoveAll(windowFiles.dir)
	}
	return code
}

func keptDirs() []string {
	dirs := []string{dataDir(), downloadsDir(), wasmCacheFor(true), wasmCacheFor(false)}
	for _, name := range []string{"HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"} {
		dirs = append(dirs, os.Getenv(name))
	}
	return append(append(dirs, erasable()...), webviewFolders()...)
}

func outside(root string, dirs []string) []string {
	roots := []string{root}
	if real, err := filepath.EvalSymlinks(root); err == nil && real != root {
		roots = append(roots, real)
	}
	var out []string
	for _, d := range dirs {
		if d != "" && !within(roots, d) && !slices.Contains(out, d) {
			out = append(out, d)
		}
	}
	return out
}

func within(roots []string, path string) bool {
	if !filepath.IsAbs(path) {
		return false
	}
	for _, r := range roots {
		if rel, err := filepath.Rel(r, path); err == nil && filepath.IsLocal(rel) {
			return true
		}
	}
	return false
}
