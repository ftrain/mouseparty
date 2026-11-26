package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const (
	updateAsset  = "MouseParty-macos-arm64.dmg"  // the app, in each release: the disk image people install from
	updateBundle = "io.github.ftrain.mouseparty" // what an update's Info.plist must say it is (packaging/darwin/Info.plist)
	restartItem  = "Party > Restart to Update"
)

// thisBundle: the app this program is in, and why it can't be updated where it is ("" if it can)
func (a *App) thisBundle() (string, string) {
	path := a.bundlePath
	if path == "" {
		exe, err := os.Executable()
		if err != nil {
			return "", "where Mouse Party is isn't known"
		}
		exe, _ = filepath.EvalSymlinks(exe)
		path = filepath.Dir(filepath.Dir(filepath.Dir(exe))) // …/Mouse Party.app/Contents/MacOS/MouseParty
	}
	switch {
	case !strings.HasSuffix(path, ".app"):
		return path, "this isn't the app (it's run from its source)"
	case strings.Contains(path, "/AppTranslocation/"):
		return path, "macOS is running a read-only copy of it: move Mouse Party to Applications, open it from there, and it can update itself"
	}
	probe, err := os.CreateTemp(filepath.Dir(path), ".mouseparty-update-")
	if err != nil {
		return path, "it can't write to " + filepath.Dir(path) + ": move Mouse Party to Applications"
	}
	probe.Close()
	os.Remove(probe.Name())
	return path, ""
}

func (a *App) updateByHand() string { return "" }

func (a *App) tidyUpdate() {}

// fetchUpdate: the release's disk image, its SHA-256 checked, the app in it copied out beside bundle and checked; its path
func fetchUpdate(rel *release, bundle string, step func(got, total int64)) (string, error) {
	dir, err := updateDir()
	if err != nil {
		return "", err
	}
	os.RemoveAll(dir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	defer os.RemoveAll(dir)
	dmg := filepath.Join(dir, updateAsset)
	if _, err := fetch(context.Background(), rel.URL, dmg, nil, func(_ string, got, total int64) { step(got, total) }); err != nil {
		return "", err
	}
	f, err := os.Open(dmg)
	if err != nil {
		return "", err
	}
	h := sha256.New()
	_, err = io.Copy(h, f)
	f.Close()
	if err != nil {
		return "", err
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != rel.Sum {
		return "", errors.New("it isn't what the release says it is (its SHA-256 differs)")
	}
	if _, err := fetchSigned(rel, dmg); err != nil {
		return "", err
	}
	// opened where nothing sees it (no Finder window, not in the sidebar), read-only, and put away again
	mount := filepath.Join(dir, "mount")
	if out, err := exec.Command("/usr/bin/hdiutil", "attach", "-nobrowse", "-noautoopen", "-readonly", "-noverify",
		"-mountpoint", mount, dmg).CombinedOutput(); err != nil {
		return "", fmt.Errorf("its disk image didn't open: %s", strings.TrimSpace(string(out)))
	}
	defer exec.Command("/usr/bin/hdiutil", "detach", "-force", mount).Run()
	stage := stagingDir(bundle)
	os.RemoveAll(stage)
	app := filepath.Join(stage, filepath.Base(bundle))
	if out, err := exec.Command("/usr/bin/ditto", filepath.Join(mount, "Mouse Party.app"), app).CombinedOutput(); err != nil {
		os.RemoveAll(stage)
		return "", fmt.Errorf("its app didn't copy out: %s", strings.TrimSpace(string(out)))
	}
	if why := checkBundle(app, rel.Version, teamOf(bundle)); why != "" {
		os.RemoveAll(stage)
		return "", errors.New(why)
	}
	return app, nil
}

// checkBundle: why the unpacked app isn't the update it should be ("" when it is): whole as signed, Mouse Party, that version
func checkBundle(app, want, team string) string {
	if out, err := exec.Command("/usr/bin/codesign", "--verify", "--deep", "--strict", app).CombinedOutput(); err != nil {
		return "its signature doesn't check: " + strings.TrimSpace(string(out))
	}
	if team != "" { // this Mouse Party has a Developer ID: an update must be signed by the same developer
		req := fmt.Sprintf(`=anchor apple generic and certificate leaf[subject.OU] = "%s"`, team)
		if out, err := exec.Command("/usr/bin/codesign", "--verify", "--deep", "--strict", "-R", req, app).CombinedOutput(); err != nil {
			return "it isn't signed by Mouse Party's developer (" + team + "): " + strings.TrimSpace(string(out))
		}
	}
	plist := filepath.Join(app, "Contents", "Info.plist")
	read := func(key string) string {
		out, _ := exec.Command("/usr/libexec/PlistBuddy", "-c", "Print :"+key, plist).Output()
		return strings.TrimSpace(string(out))
	}
	if id := read("CFBundleIdentifier"); id != updateBundle {
		return "it isn't Mouse Party (" + id + ")"
	}
	if v := read("CFBundleShortVersionString"); v != want {
		return fmt.Sprintf("it says it's version %q, not %s", v, want)
	}
	return ""
}

// teamOf: the Developer ID team that signed an app; "" when it's signed ad hoc (or not at all)
func teamOf(app string) string {
	out, _ := exec.Command("/usr/bin/codesign", "-dv", "--verbose=2", app).CombinedOutput()
	for _, line := range strings.Split(string(out), "\n") {
		if t, ok := strings.CutPrefix(line, "TeamIdentifier="); ok && t != "not set" {
			return strings.TrimSpace(t)
		}
	}
	return ""
}

// installUpdate puts the downloaded app in this one's place (at quitting): this one aside, the new one in, this one deleted
func (a *App) installUpdate() error {
	u := &a.update
	if u.state != "ready" || u.staged == "" {
		return nil
	}
	bundle, why := a.thisBundle()
	if why != "" {
		return errors.New(why)
	}
	old := filepath.Join(stagingDir(bundle), "old.app")
	os.RemoveAll(old)
	if err := os.Rename(bundle, old); err != nil {
		return err
	}
	if err := os.Rename(u.staged, bundle); err != nil {
		os.Rename(old, bundle) // put back as it was
		return err
	}
	os.RemoveAll(stagingDir(bundle))
	a.log("Updated to Mouse Party " + u.latest)
	u.state, u.staged = "", ""
	return nil
}

// reopen opens the app at path once this process has gone (Restart to Update)
func reopen(path string) {
	cmd := exec.Command("/bin/sh", "-c", `sleep 1; exec /usr/bin/open "$0"`, path)
	detach(cmd) // not stopped with us
	cmd.Start()
}
