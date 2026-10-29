package main

import (
	"os"
	"testing"
)

// The list saved under the old name (~/.tubeyap.json) is moved to the new one, not copied
func TestOldSettingsMoveOver(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	os.WriteFile(oldConfigPath(), []byte(`{"countdown": 3, "queue": [{"path": "/movies/a.mkv"}]}`), 0o644)
	cfg := loadConfig()
	if cfg.Countdown != 3 || len(cfg.Queue) != 1 || cfg.Queue[0].Path != "/movies/a.mkv" {
		t.Fatalf("%+v", cfg)
	}
	if _, err := os.Stat(oldConfigPath()); !os.IsNotExist(err) {
		t.Fatal("the old file is still there")
	}
	if _, err := os.Stat(configPath()); err != nil {
		t.Fatal(err)
	}
}
