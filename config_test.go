package main

import (
	"os"
	"path/filepath"
	"testing"
)

// What TubeYap kept in ~/.tubeyap.json and ~/.tubeyap/apps comes along once.
func TestMoveOldData(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	os.WriteFile(filepath.Join(home, ".tubeyap.json"), []byte(`{"countdown": 3, "queue": [{"path": "/a.mkv"}]}`), 0o644)
	os.MkdirAll(filepath.Join(home, ".tubeyap", "apps"), 0o700)
	os.WriteFile(filepath.Join(home, ".tubeyap", "apps", "graffiti.json"), []byte(`{}`), 0o644)

	cfg := loadConfig()
	if cfg.Countdown != 3 || len(cfg.Queue) != 1 {
		t.Fatalf("settings didn't come along: %+v", cfg)
	}
	if _, err := os.Stat(filepath.Join(appsDir(), "graffiti.json")); err != nil {
		t.Fatal("the graffiti wall didn't come along:", err)
	}
	for _, old := range []string{".tubeyap.json", ".tubeyap"} {
		if _, err := os.Stat(filepath.Join(home, old)); err == nil {
			t.Error("left behind:", old)
		}
	}

	cfg.Countdown = 5
	saveConfig(cfg)
	os.WriteFile(filepath.Join(home, ".tubeyap.json"), []byte(`{"countdown": 3}`), 0o644)
	if loadConfig().Countdown != 5 {
		t.Error("an old file came back over the new settings")
	}
}

// ~/.openhouseparty.json, from builds that kept it in the home folder, comes along too
func TestMoveHomeFolderSettings(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	os.WriteFile(filepath.Join(home, ".openhouseparty.json"), []byte(`{"countdown": 4}`), 0o644)
	if loadConfig().Countdown != 4 {
		t.Fatal("settings didn't come along")
	}
	if _, err := os.Stat(filepath.Join(home, ".openhouseparty.json")); err == nil {
		t.Error("left behind")
	}
}
