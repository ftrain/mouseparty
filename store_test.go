package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// testParty: a party file of the test's own
func testParty(t *testing.T, passcode string) *party {
	t.Helper()
	p, err := openParty(filepath.Join(t.TempDir(), "party.sqlite"), passcode)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(p.close)
	return p
}

func TestSettingsKept(t *testing.T) {
	p := testParty(t, "")
	cfg := loadConfig(p)
	cfg.Countdown = 5
	cfg.Queue = []*Item{{Path: "/Movies/Vertigo.mkv"}}
	saveConfig(p, cfg)
	if got := loadConfig(p); got.Countdown != 5 || len(got.Queue) != 1 || got.Queue[0].Path != "/Movies/Vertigo.mkv" {
		t.Fatalf("not kept: %+v", got)
	}
	if loadConfig(nil).Countdown != 10 {
		t.Fatal("no party: not the defaults")
	}
}

// Sealed, the file is noise without the passcode; changed and unsealed, nothing is lost, and it's one file throughout
func TestPartySealed(t *testing.T) {
	p := testParty(t, "")
	path := p.path
	p.Save("write", []byte(`{"text":"# Vertigo, a reading"}`))
	p.putPicture("0123456789abcdef", "image/png", []byte("\x89PNG frame"))
	if partySealed(path) {
		t.Fatal("a plain file read as sealed")
	}
	only := func() {
		t.Helper()
		files, _ := filepath.Glob(filepath.Join(filepath.Dir(path), "*"))
		if len(files) != 1 {
			t.Fatal("not one file:", files)
		}
	}

	pass := `it's a "long" passcode`
	if err := p.reseal(pass); err != nil {
		t.Fatal(err)
	}
	only()
	b, _ := os.ReadFile(path)
	if !partySealed(path) || bytes.Contains(b, []byte("Vertigo")) || bytes.Contains(b, []byte("SQLite format")) {
		t.Fatal("not sealed")
	}
	if v, ok := p.Load("write"); !ok || !strings.Contains(string(v), "Vertigo") {
		t.Fatal("lost while sealing:", string(v))
	}
	if _, err := openParty(path, "wrong"); err != errPasscode {
		t.Fatal("a wrong passcode:", err)
	}
	if _, err := openParty(path, ""); err == nil {
		t.Fatal("opened sealed with no passcode")
	}

	if err := p.reseal("another"); err != nil {
		t.Fatal(err)
	}
	if _, err := openParty(path, pass); err != errPasscode {
		t.Fatal("the old passcode still opens it")
	}
	q, err := openParty(path, "another")
	if err != nil {
		t.Fatal(err)
	}
	if pic, ok := q.picture("0123456789abcdef"); !ok || string(pic.b) != "\x89PNG frame" || pic.mime != "image/png" {
		t.Fatal("the picture didn't come through")
	}
	q.close()

	if err := p.reseal(""); err != nil {
		t.Fatal(err)
	}
	only()
	if partySealed(path) {
		t.Fatal("still sealed")
	}
	if v, ok := p.Load("write"); !ok || !strings.Contains(string(v), "Vertigo") {
		t.Fatal("lost while unsealing")
	}
}

// What Open House Party kept as files comes in once, and its folder is left, renamed
func TestImportOld(t *testing.T) {
	old := filepath.Join(t.TempDir(), "Open House Party")
	for name, text := range map[string]string{
		"settings.json":                 `{"countdown": 3, "queue": [{"path": "/Movies/Vertigo.mkv"}]}`,
		"apps/write.json":               `{"text":"kept"}`,
		"apps/reel.json":                `[]`,
		"pictures/0123456789abcdef.png": "\x89PNG old",
		"pictures/not-a-picture.txt":    "x",
	} {
		os.MkdirAll(filepath.Dir(filepath.Join(old, name)), 0o700)
		os.WriteFile(filepath.Join(old, name), []byte(text), 0o600)
	}
	p := testParty(t, "")
	if err := p.importOld(old); err != nil {
		t.Fatal(err)
	}
	if cfg := loadConfig(p); cfg.Countdown != 3 || len(cfg.Queue) != 1 {
		t.Fatalf("settings: %+v", cfg)
	}
	if v, _ := p.Load("write"); string(v) != `{"text":"kept"}` {
		t.Fatal("kept:", string(v))
	}
	if _, ok := p.Load("reel"); !ok {
		t.Fatal("the reel")
	}
	if pic, ok := p.picture("0123456789abcdef"); !ok || pic.mime != "image/png" {
		t.Fatal("the picture")
	}
	if _, err := os.Stat(old); err == nil {
		t.Fatal("the old folder is still where it was")
	}
	if _, err := os.Stat(old + " (copied into Mouse Party)"); err != nil {
		t.Fatal("the old folder is gone:", err)
	}
	if p.importOld(filepath.Join(t.TempDir(), "none")) != nil {
		t.Fatal("no old folder is no trouble")
	}
}

// Sealed, the app starts locked, showing nothing; the passcode opens it, a wrong one doesn't; it can be unsealed again
func TestAppLocked(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	p, err := openParty(partyPath(), "")
	if err != nil {
		t.Fatal(err)
	}
	saveConfig(p, &Config{Countdown: 7, Queue: []*Item{}}) // no list: nothing to host
	if err := p.reseal("sesame"); err != nil {
		t.Fatal(err)
	}
	p.close()

	a := NewApp(nil)
	go a.run()
	if v := a.GetView(); !v.Locked || len(v.Rows) != 0 || a.party != nil {
		t.Fatalf("not locked: %+v", v)
	}
	a.AddPaths([]string{"/Movies/Vertigo.mkv"}, 0)
	if msg := a.Unlock("open"); msg != errPasscode.Error() {
		t.Fatal("a wrong passcode:", msg)
	}
	if msg := a.Unlock("sesame"); msg != "" {
		t.Fatal(msg)
	}
	if v := a.GetView(); v.Locked || !v.Sealed || a.cfg.Countdown != 7 || len(a.cfg.Queue) != 0 {
		t.Fatalf("not opened: %+v %+v", v, a.cfg)
	}
	if msg := a.SetPasscode("wrong", ""); msg == "" {
		t.Fatal("unsealed with a wrong passcode")
	}
	if msg := a.SetPasscode("sesame", ""); msg != "" || partySealed(partyPath()) || a.GetView().Sealed {
		t.Fatal("not unsealed:", msg)
	}
	if msg := a.SetPasscode("", "again"); msg != "" || !partySealed(partyPath()) {
		t.Fatal("not sealed again:", msg)
	}
}

// A passcode forgotten: the sealed file is set aside, never deleted, and a new party starts
func TestStartOver(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	p, _ := openParty(partyPath(), "lost")
	p.close()
	a := NewApp(nil)
	go a.run()
	if msg := a.StartOver(); msg != "" {
		t.Fatal(msg)
	}
	if a.GetView().Locked || partySealed(partyPath()) {
		t.Fatal("not a new party")
	}
	aside, _ := filepath.Glob(filepath.Join(dataDir(), "party (locked *).sqlite"))
	if len(aside) != 1 || !partySealed(aside[0]) {
		t.Fatal("the locked one isn't kept:", aside)
	}
}

// Party > Settings…: the settings as text, edited, taken back; text that won't read changes nothing
func TestSettingsText(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	a := NewApp(nil)
	go a.run()
	text := a.SettingsText()
	if !strings.Contains(text, `"countdown": 10`) {
		t.Fatal(text)
	}
	if msg := a.SetSettingsText(strings.Replace(text, `"countdown": 10`, `"countdown": 4`, 1)); msg != "" {
		t.Fatal(msg)
	}
	if msg := a.SetSettingsText("{nope"); msg == "" {
		t.Fatal("took text that isn't JSON")
	}
	if a.cfg.Countdown != 4 || loadConfig(a.party).Countdown != 4 {
		t.Fatal("not kept")
	}
}
