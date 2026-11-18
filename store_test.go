package main

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
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
	if err := p.reseal("", pass); err != nil {
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

	if err := p.reseal(pass, "another"); err != nil {
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

	if err := p.reseal("another", ""); err != nil {
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
	tempHome(t)
	p, err := openParty(partyPath(), "")
	if err != nil {
		t.Fatal(err)
	}
	saveConfig(p, &Config{Countdown: 7, Queue: []*Item{}}) // no list: nothing to host
	if err := p.reseal("", "sesame"); err != nil {
		t.Fatal(err)
	}
	p.close()

	a := testApp(t)
	if v := a.GetView(); !v.Locked || len(v.Rows) != 0 || a.party != nil {
		t.Fatalf("not locked: %+v", v)
	}
	a.AddPaths([]string{"/Movies/Vertigo.mkv"}, 0, -1)
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
	tempHome(t)
	p, _ := openParty(partyPath(), "lost")
	p.close()
	a := testApp(t)
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

// Party > Erase All Data: the party file, the download cache and Open House Party's old folder
// go, and nothing is written again before the app quits
func TestEraseAll(t *testing.T) {
	tempHome(t)
	a := testApp(t)
	text := a.SettingsText()
	if msg := a.SetSettingsText(strings.Replace(text, `"countdown": 10`, `"countdown": 4`, 1)); msg != "" {
		t.Fatal(msg)
	}
	a.wait(func() { a.party.Save("graffiti", []byte(`{"lines":[]}`)) })
	cache, _ := os.UserCacheDir()
	written := []string{filepath.Join(downloadsDir(), "abc", "movie.mp4"), filepath.Join(dataDir(), "party (locked 2026-01-01).sqlite")}
	gone := []string{dataDir(), filepath.Join(cache, "Mouse Party")}
	if old := oldDataDir(); old != "" {
		written = append(written, filepath.Join(old+" (copied into Mouse Party)", "settings.json"))
		gone = append(gone, old+" (copied into Mouse Party)")
	}
	for _, f := range written {
		os.MkdirAll(filepath.Dir(f), 0o755)
		os.WriteFile(f, []byte("x"), 0o644)
	}
	if msg := a.EraseAll(); msg != "" {
		t.Fatal(msg)
	}
	a.shutdown(nil) // what quitting does: saves nothing now
	for _, dir := range gone {
		if _, err := os.Stat(dir); !os.IsNotExist(err) {
			t.Fatal("still there:", dir)
		}
	}
	b := testApp(t) // and the next time it opens, it's new
	if b.GetView().Locked || b.cfg.Countdown != 10 {
		t.Fatal("not as new:", b.cfg.Countdown)
	}
	if _, ok := b.party.Load("graffiti"); ok {
		t.Fatal("an app's keeping survived")
	}
}

// Party > Settings…: the settings as text, edited, taken back; text that won't read changes nothing
func TestSettingsText(t *testing.T) {
	tempHome(t)
	a := testApp(t)
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

// Where each system keeps the party, the downloads and the compiled tools: Linux's
// $XDG_DATA_HOME (~/.local/share) and cache; Windows's local AppData for both, never the roaming
// one; macOS's Application Support and Caches. What Erase All Data deletes is all in the home.
func TestDataDirs(t *testing.T) {
	home := tempHome(t)
	want := map[string]string{
		"linux":   filepath.Join(os.Getenv("XDG_DATA_HOME"), "Mouse Party"),
		"windows": filepath.Join(os.Getenv("LOCALAPPDATA"), "Mouse Party"),
		"darwin":  filepath.Join(home, "Library", "Application Support", "Mouse Party"),
	}[runtime.GOOS]
	if want != "" && dataDir() != want {
		t.Fatalf("the party is in %s, not %s", dataDir(), want)
	}
	cache := map[string]string{
		"linux":   filepath.Join(os.Getenv("XDG_CACHE_HOME"), "Mouse Party"),
		"windows": filepath.Join(os.Getenv("LOCALAPPDATA"), "Mouse Party"),
		"darwin":  filepath.Join(home, "Library", "Caches", "Mouse Party"),
	}[runtime.GOOS]
	if cache != "" && cacheDir() != cache {
		t.Fatalf("the cache is %s, not %s", cacheDir(), cache)
	}
	if partyPath() != filepath.Join(dataDir(), "party.sqlite") || downloadsDir() != filepath.Join(cacheDir(), "downloads") ||
		wasmCacheFor(true) != filepath.Join(cacheDir(), "wasm") || wasmCacheFor(false) != filepath.Join(cacheDir(), "wasm-unboxed") {
		t.Fatal(partyPath(), downloadsDir(), wasmCacheFor(true))
	}
	if runtime.GOOS == "linux" {
		t.Setenv("XDG_DATA_HOME", "not/absolute")
		if dataDir() != filepath.Join(home, ".local", "share", "Mouse Party") {
			t.Fatal("a relative XDG_DATA_HOME was taken:", dataDir())
		}
	}
	for _, p := range append(erasable(), webviewFolders()...) {
		if rel, err := filepath.Rel(home, p); err != nil || rel == "." || strings.HasPrefix(rel, "..") || !filepath.IsAbs(p) {
			t.Errorf("Erase All Data would delete %s", p)
		}
	}
	for name := range homeEnv(home) {
		t.Setenv(name, "")
	}
	if dirs := erasable(); len(dirs) != 0 {
		t.Fatal("with no home, Erase All Data would delete", dirs, "from where it was started")
	}
}

// Of the registry, only keys of the app's own are deleted: named for it, or a class it registered
func TestOnlyTheAppsOwnKeys(t *testing.T) {
	for key, own := range map[string]bool{
		`Software\Classes\AppUserModelId\MouseParty.exe`:                 true,
		`SOFTWARE\MouseParty.exe`:                                        true,
		`Software\Classes\CLSID\{0F1B4A16-3C2D-4E5F-8A9B-0C1D2E3F4A5B}\`: true,
		`Software\Classes\CLSID`:                                         false,
		`Software\Classes\CLSID\`:                                        false,
		`Software\Classes\CLSID\{0F1B4A16}`:                              false,
		`Software\Microsoft`:                                             false,
		`MouseParty.exe`:                                                 false,
		``:                                                               false,
	} {
		if ownKey(key) != own {
			t.Errorf("%q: %v", key, !own)
		}
	}
}

// After Erase All Data, once the app has gone: what's listed is deleted (only whole paths, and on
// Windows keys of its own), then the app is opened again, handed nothing of the app's open files,
// nor its own tools' folder on its PATH
func TestThenErasesThenOpens(t *testing.T) {
	gone := exec.Command(os.Args[0], "-test.run=^$")
	if err := gone.Run(); err != nil {
		t.Fatal(err)
	}
	pid := strconv.Itoa(gone.Process.Pid)
	dir := t.TempDir()
	t.Chdir(dir)
	var paths []string
	for _, name := range []string{"data", "cache"} {
		p := filepath.Join(dir, name)
		os.MkdirAll(filepath.Join(p, "inner"), 0o700)
		os.WriteFile(filepath.Join(p, "inner", "kept"), []byte("x"), 0o600)
		paths = append(paths, p)
	}
	os.MkdirAll("relative", 0o700)
	key := registryRoot + `Software\MouseParty test ` + pid + `\none`
	if code := thenMain(append([]string{pid, ""}, append(paths, "relative", key, filepath.Join(dir, "never there"))...)); code != 0 {
		t.Fatal("exit", code)
	}
	for _, p := range paths {
		if _, err := os.Stat(p); !os.IsNotExist(err) {
			t.Error("still there:", p)
		}
	}
	if _, err := os.Stat("relative"); err != nil {
		t.Error("a relative path was erased")
	}
	if runtime.GOOS == "windows" {
		return
	}
	script := filepath.Join(dir, "open.sh")
	os.WriteFile(script, []byte("#!/bin/sh\nreadlink /proc/$$/fd/3 > \"$0.fd3\" 2>/dev/null\nprintf %s \"$PATH\" > \"$0.path\"\ntouch \"$0.ran\"\n"), 0o700)
	held, err := os.Open(os.DevNull)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()
	helper := exec.Command(os.Args[0], thenArg, pid, script, filepath.Join(dir, "more"))
	helper.ExtraFiles = []*os.File{held}
	helper.Env = append(os.Environ(), "PATH="+bundledBin()+string(os.PathListSeparator)+os.Getenv("PATH"))
	if out, err := helper.CombinedOutput(); err != nil {
		t.Fatal(err, string(out))
	}
	for end := time.Now().Add(10 * time.Second); ; time.Sleep(50 * time.Millisecond) {
		if _, err := os.Stat(script + ".ran"); err == nil {
			break
		}
		if time.Now().After(end) {
			t.Fatal("never opened")
		}
	}
	if b, _ := os.ReadFile(script + ".fd3"); runtime.GOOS == "linux" && strings.TrimSpace(string(b)) != "" {
		t.Fatal("the app opened again holding the old one's file:", string(b))
	}
	if b, _ := os.ReadFile(script + ".path"); string(b) != os.Getenv("PATH") {
		t.Fatalf("the app opened again with the old one's own tools first on its PATH: %q", b)
	}
}
