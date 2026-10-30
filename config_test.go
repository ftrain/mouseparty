package main

import "testing"

// The settings are written into their folder, made the first time
func TestSettingsKept(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	cfg := loadConfig()
	cfg.Countdown = 5
	saveConfig(cfg)
	if loadConfig().Countdown != 5 {
		t.Fatal("not kept")
	}
}
