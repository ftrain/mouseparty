package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestVersions(t *testing.T) {
	for _, c := range []struct {
		a, b  string
		newer bool
	}{{"3.1.0", "3.0.9", true}, {"v3.0.10", "3.0.9", true}, {"3.0.0", "3.0.0", false}, {"2.9.9", "3.0.0", false},
		{"3.1", "3.0.0", false}, {"3.1.0-beta", "3.0.0", false}, {"3.01.0", "3.0.0", false}, {"4.0.0", "dev", false}} {
		if got := newer(c.a, c.b); got != c.newer {
			t.Errorf("newer(%q, %q) = %v", c.a, c.b, got)
		}
	}
}

// fakeApp: a Mouse Party.app at dir saying it's version v (and bundle id), its program a script, signed ad hoc
func fakeApp(t *testing.T, dir, v, id string) string {
	t.Helper()
	app := filepath.Join(dir, "Mouse Party.app")
	os.MkdirAll(filepath.Join(app, "Contents", "MacOS"), 0o755)
	plist := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>MouseParty</string>
<key>CFBundleIdentifier</key><string>` + id + `</string>
<key>CFBundleShortVersionString</key><string>` + v + `</string>
<key>CFBundleVersion</key><string>` + v + `</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>`
	os.WriteFile(filepath.Join(app, "Contents", "Info.plist"), []byte(plist), 0o644)
	os.WriteFile(filepath.Join(app, "Contents", "MacOS", "MouseParty"), []byte("#!/bin/sh\necho "+v+"\n"), 0o755)
	if out, err := exec.Command("/usr/bin/codesign", "--force", "--deep", "--sign", "-", app).CombinedOutput(); err != nil {
		t.Fatal(err, string(out))
	}
	return app
}

func plistVersion(app string) string {
	out, _ := exec.Command("/usr/libexec/PlistBuddy", "-c", "Print :CFBundleShortVersionString", filepath.Join(app, "Contents", "Info.plist")).Output()
	return strings.TrimSpace(string(out))
}

// An update: the highest release with the app's disk image and its SHA-256 found (drafts, prereleases, other tags and
// one with no SHA-256 passed over), downloaded, checked, unpacked beside the app, and put in its place
// when it quits; one whose SHA-256 differs, or that isn't Mouse Party, refused, nothing changed; a
// development build, or an app macOS runs from a read-only copy, never updated.
func TestUpdate(t *testing.T) {
	if _, err := os.Stat("/usr/bin/hdiutil"); err != nil {
		t.Skip("needs macOS (hdiutil, ditto, codesign)")
	}
	t.Setenv("HOME", t.TempDir()) // never the real party file, nor the real cache
	t.Setenv("XDG_CACHE_HOME", "")
	dir := t.TempDir()
	// the release: a newer app on a disk image, as the build makes it, and the SHA-256 GitHub gives it
	made := filepath.Join(dir, "made")
	fakeApp(t, made, "9.9.0", updateBundle)
	os.Symlink("/Applications", filepath.Join(made, "Applications"))
	dmg := filepath.Join(dir, updateAsset)
	if out, err := exec.Command("/usr/bin/hdiutil", "create", "-quiet", "-volname", "Mouse Party", "-srcfolder", made,
		"-fs", "HFS+", "-format", "UDZO", "-ov", dmg).CombinedOutput(); err != nil {
		t.Fatal(err, string(out))
	}
	body, _ := os.ReadFile(dmg)
	sum := sha256.Sum256(body)
	good := hex.EncodeToString(sum[:])
	served := good
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asset := func(name string) map[string]any {
			return map[string]any{"name": name, "browser_download_url": server.URL + "/" + name, "size": len(body), "digest": "sha256:" + served}
		}
		bare := asset(updateAsset)
		delete(bare, "digest")
		switch r.URL.Path {
		case "/releases":
			json.NewEncoder(w).Encode([]map[string]any{
				{"tag_name": "v9.9.0", "assets": []any{asset(updateAsset), asset("MouseParty-v9.9.0-gpl-sources.tar")}},
				{"tag_name": "v10.0.0", "draft": true, "assets": []any{asset(updateAsset)}},
				{"tag_name": "v9.10.0-rc1", "assets": []any{asset(updateAsset)}},
				{"tag_name": "v9.9.5", "assets": []any{bare}},                                // no SHA-256: not a release to take
				{"tag_name": "v9.9.7", "assets": []any{asset("MouseParty-macos-arm64.zip")}}, // an old release's zip: not the app now
				{"tag_name": "python-wasm-3.15.2-abc", "assets": []any{asset(updateAsset)}},
				{"tag_name": "v3.0.0", "assets": []any{asset(updateAsset)}},
			})
		case "/" + updateAsset:
			w.Write(body)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	was := updatesAPI
	updatesAPI = server.URL + "/releases"
	defer func() { updatesAPI = was }()
	wasVersion := version
	version = "3.0.0"
	defer func() { version = wasVersion }()

	installed := fakeApp(t, filepath.Join(dir, "Applications"), "3.0.0", updateBundle)
	a := NewApp(standby)
	a.bundlePath = installed
	go a.run()
	defer a.shutdown(nil)
	until := func(what string, ok func(UpdateStatus) bool) UpdateStatus {
		t.Helper()
		for end := time.Now().Add(20 * time.Second); time.Now().Before(end); time.Sleep(50 * time.Millisecond) {
			if s := a.Prefs().Update; ok(s) {
				return s
			}
		}
		t.Fatalf("never: %s (%+v)", what, a.Prefs().Update)
		return UpdateStatus{}
	}

	// a SHA-256 that differs: refused, nothing unpacked
	served = strings.Repeat("0", 64)
	a.CheckForUpdates()
	s := until("refused", func(s UpdateStatus) bool { return s.State == "error" })
	if !strings.Contains(s.Text, "SHA-256") {
		t.Errorf("why: %q", s.Text)
	}
	if _, err := os.Stat(stagingDir(installed)); !os.IsNotExist(err) {
		t.Error("a refused update left something beside the app")
	}

	// the right one: down, checked, beside the app, and in at quitting
	served = good
	a.CheckForUpdates()
	s = until("ready", func(s UpdateStatus) bool { return s.Ready })
	if s.Latest != "9.9.0" || s.Version != "3.0.0" || !strings.Contains(s.Text, "9.9.0 is ready") {
		t.Errorf("ready: %+v", s)
	}
	if plistVersion(installed) != "3.0.0" {
		t.Fatal("the update went in before quitting")
	}
	a.CheckForUpdates() // one is waiting: nothing fetched over it
	if s := a.Prefs().Update; !s.Ready {
		t.Errorf("checking again undid the one waiting: %+v", s)
	}
	a.shutdown(nil)
	if v := plistVersion(installed); v != "9.9.0" {
		t.Fatalf("after quitting, the app is %q", v)
	}
	if _, err := os.Stat(stagingDir(installed)); !os.IsNotExist(err) {
		t.Error("the update's folder is still beside the app")
	}

	// that version is the newest: up to date
	version = "9.9.0"
	b := NewApp(standby)
	b.bundlePath = installed
	go b.run()
	defer b.shutdown(nil)
	b.CheckForUpdates()
	for end := time.Now().Add(10 * time.Second); time.Now().Before(end) && b.Prefs().Update.State != "current"; time.Sleep(50 * time.Millisecond) {
	}
	if s := b.Prefs().Update; s.State != "current" || s.Text != "Mouse Party is up to date." {
		t.Errorf("up to date: %+v", s)
	}

	// what can't update itself: a development build; a read-only copy macOS runs
	version = "dev"
	b.CheckForUpdates()
	time.Sleep(100 * time.Millisecond)
	if s := b.Prefs().Update; !strings.Contains(s.Text, "development build") {
		t.Errorf("a development build: %+v", s)
	}
	b.bundlePath = "/private/var/folders/xy/T/AppTranslocation/ABC/d/Mouse Party.app"
	if _, why := b.thisBundle(); !strings.Contains(why, "Applications") {
		t.Errorf("translocated: %q", why)
	}

	// an app that isn't Mouse Party, or isn't the version its release says, is refused
	other := fakeApp(t, filepath.Join(dir, "other"), "9.9.0", "com.example.notit")
	if why := checkBundle(other, "9.9.0", ""); !strings.Contains(why, "isn't Mouse Party") {
		t.Errorf("another app: %q", why)
	}
	if why := checkBundle(installed, "9.9.1", ""); !strings.Contains(why, "version") {
		t.Errorf("the wrong version: %q", why)
	}
	// signed ad hoc, it has no team; a Mouse Party with a Developer ID takes only an update from the same one
	if team := teamOf(installed); team != "" {
		t.Errorf("an ad hoc app's team: %q", team)
	}
	if why := checkBundle(installed, "3.0.0", "ABCDE12345"); !strings.Contains(why, "developer") {
		t.Errorf("not the developer's: %q", why)
	}
	os.WriteFile(filepath.Join(other, "Contents", "MacOS", "MouseParty"), []byte("#!/bin/sh\necho changed\n"), 0o755)
	if why := checkBundle(other, "9.9.0", ""); !strings.Contains(why, "signature") {
		t.Errorf("changed after signing: %q", why)
	}
}
