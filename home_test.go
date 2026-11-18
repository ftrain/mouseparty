package main

import (
	"path/filepath"
	"testing"
)

// Every test's HOME is its own data folder (dataDir): on Linux, XDG_CONFIG_HOME
// (set on GitHub's runners) would put them all in one, each seeing the others' lists
func tempHome(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	for name, dir := range homeEnv(home) {
		t.Setenv(name, dir)
	}
	return home
}

func homeEnv(home string) map[string]string {
	return map[string]string{
		"HOME": home, "USERPROFILE": home,
		"XDG_CONFIG_HOME": filepath.Join(home, ".config"), "XDG_CACHE_HOME": filepath.Join(home, ".cache"),
		"XDG_DATA_HOME": filepath.Join(home, ".local", "share"), "XDG_STATE_HOME": filepath.Join(home, ".local", "state"),
		"APPDATA": filepath.Join(home, "AppData", "Roaming"), "LOCALAPPDATA": filepath.Join(home, "AppData", "Local"),
	}
}
