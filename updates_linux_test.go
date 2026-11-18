package main

import (
	"bytes"
	"crypto/sha256"
	"debug/elf"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func init() { fakeTools["appimage"] = fakeAppImageRun }

func fakeAppImageRun(args []string) int {
	if len(args) == 1 && args[0] == "reopen" {
		reopen(filepath.Join(os.TempDir(), "not the AppImage"))
		return 0
	}
	dir := os.Getenv(fakeDirEnv)
	said := fmt.Sprintf("%s %q\n", os.Args[0], os.Getenv("APPIMAGE_EXTRACT_AND_RUN"))
	if os.WriteFile(filepath.Join(dir, "opening"), []byte(said), 0o644) != nil ||
		os.Rename(filepath.Join(dir, "opening"), filepath.Join(dir, "opened")) != nil {
		return 1
	}
	return 0
}

type fakeAppImage struct {
	machine    elf.Machine
	unmarked   bool
	noApp      bool
	sectionEnd uint64
}

func (f fakeAppImage) bytes(payload string) []byte {
	if f.machine == 0 {
		f.machine = appImageMachine[runtime.GOARCH]
	}
	h := elf.Header64{Type: uint16(elf.ET_EXEC), Machine: uint16(f.machine), Version: uint32(elf.EV_CURRENT),
		Shoff: 64, Ehsize: 64, Shentsize: 64, Shnum: 1}
	copy(h.Ident[:], elf.ELFMAG)
	h.Ident[elf.EI_CLASS], h.Ident[elf.EI_DATA], h.Ident[elf.EI_VERSION] = byte(elf.ELFCLASS64), byte(elf.ELFDATA2LSB), byte(elf.EV_CURRENT)
	if !f.unmarked {
		copy(h.Ident[8:], "AI\x02")
	}
	sections := []elf.Section64{{}}
	if f.sectionEnd > 0 {
		h.Shnum = 2
		sections = append(sections, elf.Section64{Type: uint32(elf.SHT_PROGBITS), Off: f.sectionEnd - 16, Size: 16})
	}
	var b bytes.Buffer
	binary.Write(&b, binary.LittleEndian, h)
	binary.Write(&b, binary.LittleEndian, sections)
	for uint64(b.Len()) < f.sectionEnd {
		b.WriteByte(0)
	}
	if !f.noApp {
		b.WriteString("hsqs")
	}
	b.WriteString(payload)
	return b.Bytes()
}

func writeAppImage(t *testing.T, path string, body []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, body, 0o755); err != nil {
		t.Fatal(err)
	}
}

func TestAppImageChecks(t *testing.T) {
	dir := t.TempDir()
	other := elf.EM_RISCV
	if runtime.GOARCH == "riscv64" {
		other = elf.EM_X86_64
	}
	misplaced := fakeAppImage{sectionEnd: 512, noApp: true}.bytes("")
	copy(misplaced[64+2*64:], "hsqs")
	for _, c := range []struct {
		name string
		body []byte
		why  string
	}{
		{"an AppImage", fakeAppImage{}.bytes("9.9.0"), ""},
		{"one whose last section ends past its headers", fakeAppImage{sectionEnd: 512}.bytes("9.9.0"), ""},
		{"a script", []byte("#!/bin/sh\necho hi\n"), "isn't an AppImage"},
		{"a program that isn't an AppImage", fakeAppImage{unmarked: true}.bytes("9.9.0"), "no AppImage mark"},
		{"another processor's", fakeAppImage{machine: other}.bytes("9.9.0"), "processor"},
		{"a runtime holding nothing", fakeAppImage{noApp: true}.bytes(""), "holds no app"},
		{"one whose app isn't where its sections end", misplaced, "holds no app"},
		{"one cut short", fakeAppImage{}.bytes("9.9.0")[:20], "isn't an AppImage"},
	} {
		path := filepath.Join(dir, strings.ReplaceAll(c.name, " ", "-"))
		writeAppImage(t, path, c.body)
		if why := appImageWhy(path); (c.why == "") != (why == "") || !strings.Contains(why, c.why) {
			t.Errorf("%s: %q", c.name, why)
		}
	}
	if why := appImageWhy(filepath.Join(dir, "gone")); !strings.Contains(why, "can't be read") {
		t.Errorf("no file: %q", why)
	}
}

func TestAppImageFound(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	exe, _ = filepath.EvalSymlinks(exe)
	dir := t.TempDir()
	image := filepath.Join(dir, "Apps", "Mouse Party.AppImage")
	writeAppImage(t, image, fakeAppImage{}.bytes("3.0.0"))
	image, _ = filepath.EvalSymlinks(image)
	link := filepath.Join(dir, "mouseparty")
	os.Symlink(image, link)
	t.Setenv("APPIMAGE", link)
	t.Setenv("APPDIR", filepath.Dir(exe))
	a := &App{}
	if got := appImageOf(exe); got != image {
		t.Errorf("the AppImage this runs from: %q", got)
	}
	if path, why := a.thisBundle(); path != image || why != "" {
		t.Errorf("an AppImage: %q, %q", path, why)
	}
	if how := a.updateByHand(); how != "" {
		t.Errorf("an AppImage updates itself: %q", how)
	}

	t.Setenv("APPDIR", dir)
	if got := appImageOf(exe); got != "" {
		t.Errorf("APPDIR isn't where this runs from: %q", got)
	}
	if path, why := a.thisBundle(); path != exe || why == "" {
		t.Errorf("not an AppImage: %q, %q", path, why)
	}
	if how := a.updateByHand(); how != "get it from "+updatesPage {
		t.Errorf("not an AppImage: %q", how)
	}
	was := rpmInstall
	rpmInstall = filepath.Dir(exe)
	if how := a.updateByHand(); !strings.Contains(how, "RPM") || !strings.Contains(how, "dnf") {
		t.Errorf("the RPM: %q", how)
	}
	rpmInstall = was

	t.Setenv("APPDIR", filepath.Dir(exe))
	t.Setenv("APPIMAGE", "Apps/Mouse Party.AppImage")
	if got := appImageOf(exe); got != "" {
		t.Errorf("a relative APPIMAGE: %q", got)
	}
	t.Setenv("APPIMAGE", "")
	if got := appImageOf(exe); got != "" {
		t.Errorf("no APPIMAGE: %q", got)
	}

	writeAppImage(t, image, fakeAppImage{unmarked: true}.bytes("3.0.0"))
	t.Setenv("APPIMAGE", image)
	if _, why := a.thisBundle(); !strings.Contains(why, "AppImage mark") {
		t.Errorf("APPIMAGE isn't an AppImage: %q", why)
	}
	writeAppImage(t, image, fakeAppImage{}.bytes("3.0.0"))
	if os.Geteuid() != 0 {
		os.Chmod(filepath.Dir(image), 0o555)
		defer os.Chmod(filepath.Dir(image), 0o755)
		if _, why := a.thisBundle(); !strings.Contains(why, "can't write to "+filepath.Dir(image)) {
			t.Errorf("a folder this user can't write to: %q", why)
		}
	}
}

func TestUpdateAppImage(t *testing.T) {
	tempHome(t)
	withAppVersion(t, "3.0.0")
	dir := t.TempDir()
	installed := filepath.Join(dir, "Applications", updateAsset)
	old := fakeAppImage{}.bytes("3.0.0")
	writeAppImage(t, installed, old)
	var mu sync.Mutex
	body := fakeAppImage{}.bytes("9.9.0")
	sumOf := func(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }
	served := strings.Repeat("0", 64)
	set := func(b []byte, sum string) { mu.Lock(); body, served = b, sum; mu.Unlock() }
	standInGitHub(t, func(asset func(name, sum string) map[string]any) []map[string]any {
		mu.Lock()
		served := served
		mu.Unlock()
		return []map[string]any{
			{"tag_name": "v9.9.0", "html_url": "https://github.com/ftrain/mouseparty/releases/tag/v9.9.0", "assets": []any{asset(updateAsset, served)}},
			{"tag_name": "v10.0.0", "draft": true, "assets": []any{asset(updateAsset, served)}},
			{"tag_name": "v3.0.0", "assets": []any{asset(updateAsset, served)}},
		}
	}, func(name string) []byte {
		mu.Lock()
		defer mu.Unlock()
		if name == updateAsset {
			return body
		}
		return nil
	})
	cache, _ := updateDir()
	gone := func(what, path string) {
		t.Helper()
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Errorf("%s is still there: %s", what, path)
		}
	}
	staged := filepath.Join(stagingDir(installed), updateAsset)

	a := NewApp(standby)
	a.bundlePath = installed
	go a.run()
	defer a.shutdown(nil)
	a.CheckForUpdates()
	s := untilUpdate(t, a, "refused", func(s UpdateStatus) bool { return s.State == "error" })
	if !strings.Contains(s.Text, "SHA-256") {
		t.Errorf("why: %q", s.Text)
	}
	gone("a refused update", stagingDir(installed))
	gone("a refused download", cache)

	set(fakeAppImage{unmarked: true}.bytes("9.9.0"), sumOf(fakeAppImage{unmarked: true}.bytes("9.9.0")))
	a.CheckForUpdates()
	s = untilUpdate(t, a, "refused", func(s UpdateStatus) bool { return s.State == "error" && !strings.Contains(s.Text, "SHA-256") })
	if !strings.Contains(s.Text, "isn't an AppImage") {
		t.Errorf("not an AppImage: %q", s.Text)
	}
	gone("a refused update", stagingDir(installed))

	set(fakeAppImage{}.bytes("9.9.0"), sumOf(fakeAppImage{}.bytes("9.9.0")))
	a.CheckForUpdates()
	s = untilUpdate(t, a, "ready", func(s UpdateStatus) bool { return s.Ready })
	if s.Latest != "9.9.0" || s.Version != "3.0.0" || !strings.Contains(s.Text, "9.9.0 is ready") || s.Manual || s.Page != "" {
		t.Errorf("ready: %+v", s)
	}
	if log := a.LogText(); !strings.Contains(log, "9.9.0 is downloaded: it goes in when Mouse Party quits (or Settings > General's Restart to Update)") {
		t.Errorf("the log says:\n%s", log)
	}
	if got, _ := os.ReadFile(installed); !bytes.Equal(got, old) {
		t.Fatal("the update went in before quitting")
	}
	if got, _ := os.ReadFile(staged); !bytes.Equal(got, fakeAppImage{}.bytes("9.9.0")) {
		t.Errorf("the update beside the app: %d bytes", len(got))
	}
	gone("the download", cache)
	a.CheckForUpdates()
	if s := a.Prefs().Update; !s.Ready {
		t.Errorf("checking again undid the one waiting: %+v", s)
	}
	a.shutdown(nil)
	if got, _ := os.ReadFile(installed); !bytes.Equal(got, fakeAppImage{}.bytes("9.9.0")) {
		t.Fatalf("after quitting, the AppImage is %d bytes", len(got))
	}
	if st, err := os.Stat(installed); err != nil {
		t.Error(err)
	} else if st.Mode().Perm() != 0o755 {
		t.Errorf("the new AppImage's mode: %v", st.Mode())
	}
	gone("the update's folder", stagingDir(installed))

	withAppVersion(t, "9.9.0")
	b := NewApp(standby)
	b.bundlePath = installed
	go b.run()
	defer b.shutdown(nil)
	b.CheckForUpdates()
	if s := untilUpdate(t, b, "up to date", func(s UpdateStatus) bool { return s.State == "current" }); s.Text != "Mouse Party is up to date." {
		t.Errorf("up to date: %+v", s)
	}
	withAppVersion(t, "dev")
	b.CheckForUpdates()
	if s := untilUpdate(t, b, "a development build", func(s UpdateStatus) bool { return s.State == "error" }); !strings.Contains(s.Text, "development build") {
		t.Errorf("a development build: %+v", s)
	}
}

func TestUpdateTold(t *testing.T) {
	tempHome(t)
	withAppVersion(t, "3.0.0")
	t.Setenv("APPIMAGE", "")
	t.Setenv("APPDIR", "")
	page := "https://github.com/ftrain/mouseparty/releases/tag/v9.9.0"
	github := standInGitHub(t, func(asset func(name, sum string) map[string]any) []map[string]any {
		return []map[string]any{{"tag_name": "v9.9.0", "html_url": page, "assets": []any{asset(updateAsset, strings.Repeat("ab", 32))}}}
	}, nil)
	a := NewApp(standby)
	go a.run()
	defer a.shutdown(nil)
	if !a.Prefs().Update.Manual {
		t.Error("an install that isn't an AppImage updates itself")
	}
	a.CheckForUpdates()
	s := untilUpdate(t, a, "told", func(s UpdateStatus) bool { return s.State == "available" })
	if s.Text != "Mouse Party 9.9.0 is out: get it from "+updatesPage+"." || s.Page != page || !s.Manual || s.Ready || s.Busy {
		t.Errorf("told: %+v", s)
	}
	exe, _ := os.Executable()
	exe, _ = filepath.EvalSymlinks(exe)
	was := rpmInstall
	rpmInstall = filepath.Dir(exe)
	defer func() { rpmInstall = was }()
	if s := a.Prefs().Update; !strings.Contains(s.Text, "9.9.0 is out: get its RPM from "+updatesPage+" and install it with dnf.") {
		t.Errorf("the RPM: %+v", s)
	}
	a.shutdown(nil)
	if n := github.fetches.Load(); n != 0 {
		t.Errorf("an install updated by hand downloaded the update %d times", n)
	}
	withAppVersion(t, "dev")
	if s := a.Prefs().Update; s.Manual {
		t.Errorf("a development build: %+v", s)
	}
}

func TestUpdateTidied(t *testing.T) {
	tempHome(t)
	withAppVersion(t, "dev")
	dir := t.TempDir()
	installed := filepath.Join(dir, updateAsset)
	writeAppImage(t, installed, fakeAppImage{}.bytes("3.0.0"))
	cache, _ := updateDir()
	leave := func() {
		for _, d := range []string{stagingDir(installed), cache} {
			os.MkdirAll(d, 0o755)
			os.WriteFile(filepath.Join(d, "left"), []byte("x"), 0o644)
		}
	}
	for _, state := range []string{"", "ready"} {
		leave()
		a := NewApp(standby)
		a.bundlePath = installed
		go a.run()
		a.wait(func() { a.update.state = state })
		a.wait(a.autoUpdate)
		for _, d := range []string{stagingDir(installed), cache} {
			_, err := os.Stat(d)
			if left := err == nil; left != (state == "ready") {
				t.Errorf("%q: %s left %v", state, d, left)
			}
		}
		a.wait(func() { a.update.state = "" })
		a.shutdown(nil)
	}
}

func serveUpdate(t *testing.T, body []byte) {
	t.Helper()
	digest := sha256.Sum256(body)
	standInGitHub(t, func(asset func(name, sum string) map[string]any) []map[string]any {
		return []map[string]any{{"tag_name": "v9.9.0", "assets": []any{asset(updateAsset, hex.EncodeToString(digest[:]))}}}
	}, func(name string) []byte {
		if name == updateAsset {
			return body
		}
		return nil
	})
}

func TestUpdateStagedInAFolderOfItsOwn(t *testing.T) {
	tempHome(t)
	withAppVersion(t, "3.0.0")
	installed := filepath.Join(t.TempDir(), "Applications", updateAsset)
	old, newer := fakeAppImage{}.bytes("3.0.0"), fakeAppImage{}.bytes("9.9.0")
	writeAppImage(t, installed, old)
	serveUpdate(t, newer)
	stage := stagingDir(installed)
	a := testApp(t)
	a.wait(func() { a.bundlePath = installed })
	if os.Geteuid() != 0 {
		stuck := filepath.Join(stage, "stuck")
		os.MkdirAll(stuck, 0o777)
		os.WriteFile(filepath.Join(stuck, "left"), []byte("x"), 0o644)
		os.Chmod(stuck, 0o555)
		t.Cleanup(func() { os.Chmod(stuck, 0o755) })
		a.CheckForUpdates()
		s := untilUpdate(t, a, "refused", func(s UpdateStatus) bool { return s.State == "error" })
		if !strings.Contains(s.Text, stage+" is in the way and can't be deleted") {
			t.Errorf("a folder in the way: %q", s.Text)
		}
		if _, err := os.Stat(filepath.Join(stage, updateAsset)); !os.IsNotExist(err) {
			t.Errorf("the update went into a folder that was there before: %v", err)
		}
		os.Chmod(stuck, 0o755)
		os.RemoveAll(stage)
	}
	a.CheckForUpdates()
	untilUpdate(t, a, "ready", func(s UpdateStatus) bool { return s.Ready })
	if st, err := os.Lstat(stage); err != nil {
		t.Error(err)
	} else if !st.IsDir() || st.Mode().Perm() != 0o700 {
		t.Errorf("the update's folder isn't one only this user can open: %v", st.Mode())
	}
	a.shutdown(nil)
	if got, _ := os.ReadFile(installed); !bytes.Equal(got, newer) {
		t.Errorf("after quitting, the AppImage is %d bytes", len(got))
	}
}

func TestUpdateDroppedWhenItCantGoIn(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	exe, _ = filepath.EvalSymlinks(exe)
	old, newer := fakeAppImage{}.bytes("3.0.0"), fakeAppImage{}.bytes("9.9.0")
	for _, c := range []struct {
		name  string
		while func(t *testing.T, installed, link string) (kept []string)
		gone  bool
		why   string
	}{
		{"moved to another folder", func(t *testing.T, installed, _ string) []string {
			moved := filepath.Join(filepath.Dir(filepath.Dir(installed)), "Elsewhere", updateAsset)
			os.MkdirAll(filepath.Dir(moved), 0o755)
			if err := os.Rename(installed, moved); err != nil {
				t.Fatal(err)
			}
			return []string{moved}
		}, true, "isn't an AppImage"},
		{"deleted", func(t *testing.T, installed, _ string) []string {
			if err := os.Remove(installed); err != nil {
				t.Fatal(err)
			}
			return nil
		}, true, "isn't an AppImage"},
		{"APPIMAGE now another AppImage", func(t *testing.T, installed, link string) []string {
			other := filepath.Join(filepath.Dir(filepath.Dir(installed)), "Other", "Mouse Party.AppImage")
			writeAppImage(t, other, old)
			os.Remove(link)
			if err := os.Symlink(other, link); err != nil {
				t.Fatal(err)
			}
			return []string{installed, other}
		}, false, "it was downloaded for "},
		{"its update gone from beside it", func(t *testing.T, installed, _ string) []string {
			if err := os.Remove(filepath.Join(stagingDir(installed), updateAsset)); err != nil {
				t.Fatal(err)
			}
			return []string{installed}
		}, false, "rename "},
	} {
		t.Run(c.name, func(t *testing.T) {
			tempHome(t)
			withAppVersion(t, "3.0.0")
			root := t.TempDir()
			installed := filepath.Join(root, "Applications", updateAsset)
			writeAppImage(t, installed, old)
			installed, _ = filepath.EvalSymlinks(installed)
			link := filepath.Join(root, "mouseparty")
			if err := os.Symlink(installed, link); err != nil {
				t.Fatal(err)
			}
			t.Setenv("APPIMAGE", link)
			t.Setenv("APPDIR", filepath.Dir(exe))
			serveUpdate(t, newer)
			a := testApp(t)
			a.CheckForUpdates()
			untilUpdate(t, a, "ready", func(s UpdateStatus) bool { return s.Ready })
			stage := stagingDir(installed)
			if _, err := os.Stat(filepath.Join(stage, updateAsset)); err != nil {
				t.Fatalf("the update isn't beside the AppImage: %v", err)
			}
			kept := c.while(t, installed, link)
			a.shutdown(nil)
			if log := a.LogText(); !strings.Contains(log, "Couldn't put the update in: ") || !strings.Contains(log, c.why) {
				t.Errorf("the log says:\n%s", log)
			}
			if _, err := os.Lstat(stage); !os.IsNotExist(err) {
				t.Errorf("the update's folder is still there: %v", err)
			}
			for _, p := range kept {
				if got, _ := os.ReadFile(p); !bytes.Equal(got, old) {
					t.Errorf("%s is %d bytes, not the AppImage it was", p, len(got))
				}
				if _, err := os.Lstat(stagingDir(p)); !os.IsNotExist(err) {
					t.Errorf("an update's folder beside %s: %v", p, err)
				}
			}
			if _, err := os.Lstat(installed); c.gone && !os.IsNotExist(err) {
				t.Errorf("something is where the AppImage was: %v", err)
			}
			if s := a.Prefs().Update; s.Ready || s.State == "ready" {
				t.Errorf("still waiting to go in: %+v", s)
			}
		})
	}
}

func TestReopen(t *testing.T) {
	exe, dir := fakeTool(t, "appimage")
	image := filepath.Join(t.TempDir(), "Mouse Party.AppImage")
	copyFile(t, exe, image)
	opened := filepath.Join(dir, "opened")
	for _, c := range []struct{ appDir, extract string }{
		{".mount_MousePabc123", ""},
		{"appimage_extracted_0123abcd", "1"},
	} {
		os.Remove(opened)
		appDir := filepath.Join(t.TempDir(), c.appDir)
		inside := filepath.Join(appDir, "mouseparty")
		os.MkdirAll(appDir, 0o755)
		if os.Link(exe, inside) != nil {
			copyFile(t, exe, inside)
		}
		cmd := exec.Command(inside, "reopen")
		cmd.Env = append(os.Environ(), "APPIMAGE="+image, "APPDIR="+appDir, "APPIMAGE_EXTRACT_AND_RUN=")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatal(err, string(out))
		}
		var got []byte
		for end := time.Now().Add(10 * time.Second); time.Now().Before(end) && len(got) == 0; time.Sleep(50 * time.Millisecond) {
			got, _ = os.ReadFile(opened)
		}
		if want := fmt.Sprintf("%s %q\n", image, c.extract); string(got) != want {
			t.Errorf("APPDIR %s: what opened again said %q, not %q", c.appDir, got, want)
		}
	}
}

func copyFile(t *testing.T, from, to string) {
	t.Helper()
	b, err := os.ReadFile(from)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(to, b, 0o755); err != nil {
		t.Fatal(err)
	}
}

func TestUpdateRealAppImage(t *testing.T) {
	built := os.Getenv("MOUSEPARTY_APPIMAGE")
	if built == "" {
		t.Skip("checks a built AppImage: MOUSEPARTY_APPIMAGE=dist/" + updateAsset)
	}
	if why := appImageWhy(built); why != "" {
		t.Fatalf("%s: %s", built, why)
	}
	body, err := os.ReadFile(built)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	runnable := filepath.Join(dir, updateAsset)
	writeAppImage(t, runnable, body)
	offset := runtimeOffset(t, runnable)
	if offset <= 0 || offset+4 > len(body) || string(body[offset:offset+4]) != "hsqs" {
		t.Fatalf("its runtime says its app is at %d", offset)
	}
	runtimeOnly := body[:offset:offset]
	unmarked := slices.Clone(body[:offset+4])
	copy(unmarked[8:11], "\x00\x00\x00")
	for _, c := range []struct {
		name string
		body []byte
		why  string
	}{
		{"its runtime and where its app starts", body[:offset+4], ""},
		{"its runtime alone", runtimeOnly, "holds no app"},
		{"its runtime and something else", append(runtimeOnly, "sqsh"...), "holds no app"},
		{"its runtime unmarked", unmarked, "no AppImage mark"},
	} {
		path := filepath.Join(dir, strings.ReplaceAll(c.name, " ", "-"))
		writeAppImage(t, path, c.body)
		if why := appImageWhy(path); (c.why == "") != (why == "") || !strings.Contains(why, c.why) {
			t.Errorf("%s: %q", c.name, why)
		}
	}

	tempHome(t)
	withAppVersion(t, "3.0.0")
	installed := filepath.Join(t.TempDir(), "Applications", updateAsset)
	writeAppImage(t, installed, body[:offset+4])
	sum := sha256.Sum256(body)
	want := hex.EncodeToString(sum[:])
	var served atomic.Value
	served.Store(strings.Repeat("0", 64))
	standInGitHub(t, func(asset func(name, sum string) map[string]any) []map[string]any {
		return []map[string]any{{"tag_name": "v9.9.0", "assets": []any{asset(updateAsset, served.Load().(string))}}}
	}, func(name string) []byte {
		if name == updateAsset {
			return body
		}
		return nil
	})
	a := NewApp(standby)
	a.bundlePath = installed
	go a.run()
	defer a.shutdown(nil)
	a.CheckForUpdates()
	if s := untilUpdate(t, a, "refused", func(s UpdateStatus) bool { return s.State == "error" }); !strings.Contains(s.Text, "SHA-256") {
		t.Errorf("why: %q", s.Text)
	}
	served.Store(want)
	a.CheckForUpdates()
	untilUpdate(t, a, "ready", func(s UpdateStatus) bool { return s.Ready })
	if got := fileSum(t, filepath.Join(stagingDir(installed), updateAsset)); got != want {
		t.Errorf("the update beside the app has SHA-256 %s", got)
	}
	a.shutdown(nil)
	if got := fileSum(t, installed); got != want {
		t.Fatalf("after quitting, the AppImage has SHA-256 %s", got)
	}
	if st, err := os.Stat(installed); err != nil {
		t.Error(err)
	} else if st.Mode().Perm() != 0o755 {
		t.Errorf("the new AppImage's mode: %v", st.Mode())
	}
	if _, err := os.Stat(stagingDir(installed)); !os.IsNotExist(err) {
		t.Errorf("the update's folder is still there: %v", err)
	}
	if got := runtimeOffset(t, installed); got != offset {
		t.Errorf("the new AppImage's runtime finds its app at %d, not %d", got, offset)
	}
}

func runtimeOffset(t *testing.T, image string) int {
	t.Helper()
	out, err := exec.Command(image, "--appimage-offset").Output()
	if err != nil {
		t.Fatalf("%s --appimage-offset: %v", image, err)
	}
	n, err := strconv.Atoi(strings.TrimSpace(string(out)))
	if err != nil {
		t.Fatalf("%s --appimage-offset said %q", image, out)
	}
	return n
}

func fileSum(t *testing.T, path string) string {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		t.Fatal(err)
	}
	return hex.EncodeToString(h.Sum(nil))
}
