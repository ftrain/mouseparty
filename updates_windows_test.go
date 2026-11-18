package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"runtime/debug"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

func init() { fakeTools["installer"] = fakeInstaller }

func fakeInstaller([]string) int {
	dir := os.Getenv(fakeDirEnv)
	line := windows.UTF16PtrToString(windows.GetCommandLine())
	if os.WriteFile(filepath.Join(dir, "starting"), []byte(line), 0o644) != nil ||
		os.Rename(filepath.Join(dir, "starting"), filepath.Join(dir, "started")) != nil {
		return 1
	}
	return 0
}

func evSignedProgram(t *testing.T) string {
	t.Helper()
	var tried []string
	for _, dir := range xSysWindowsDirs() {
		path := filepath.Join(dir, "testdata", "ev-signed-file.exe")
		if _, err := os.Stat(path); err == nil {
			return path
		}
		tried = append(tried, path)
	}
	t.Skipf("needs x/sys's signed test program, looked for at %q", tried)
	return ""
}

func xSysWindowsDirs() []string {
	var dirs []string
	pc := reflect.ValueOf(windows.WinVerifyTrustEx).Pointer()
	if f := runtime.FuncForPC(pc); f != nil {
		if file, _ := f.FileLine(pc); filepath.IsAbs(file) {
			dirs = append(dirs, filepath.Dir(file))
		}
	}
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return dirs
	}
	for _, d := range info.Deps {
		if d.Path != "golang.org/x/sys" {
			continue
		}
		for _, cache := range []string{os.Getenv("GOMODCACHE"), goEnvAtOwnHome("GOMODCACHE")} {
			if cache != "" {
				dirs = append(dirs, filepath.Join(cache, "golang.org", "x", "sys@"+d.Version, "windows"))
			}
		}
	}
	return dirs
}

func goEnvAtOwnHome(name string) string {
	cmd := exec.Command("go", "env", name)
	cmd.Env = append(os.Environ(), ownHomeEnv()...)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func ownHomeEnv() []string {
	var token windows.Token
	if windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_QUERY|windows.TOKEN_DUPLICATE, &token) != nil {
		return nil
	}
	defer token.Close()
	env, err := token.Environ(false)
	if err != nil {
		return nil
	}
	moved := homeEnv("")
	return slices.DeleteFunc(env, func(kv string) bool {
		name, _, _ := strings.Cut(kv, "=")
		_, ok := moved[strings.ToUpper(name)]
		return !ok
	})
}

func TestAuthenticode(t *testing.T) {
	signed := evSignedProgram(t)
	who, err := authenticodeSigner(signed)
	if err != nil || !strings.Contains(who, "CN=") {
		t.Fatalf("a signed program's signer: %q %v", who, err)
	}
	if err := authenticodeTrusted(signed); err != nil {
		t.Errorf("a signed program doesn't check: %v", err)
	}
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	if who, err := authenticodeSigner(exe); who != "" || err != nil {
		t.Errorf("an unsigned program's signer: %q %v", who, err)
	}
	if err := authenticodeTrusted(exe); !errors.Is(err, windows.Errno(windows.TRUST_E_NOSIGNATURE)) {
		t.Errorf("an unsigned program: %v", err)
	}
	body, err := os.ReadFile(signed)
	if err != nil {
		t.Fatal(err)
	}
	body[len(body)/2-1]++
	changed := filepath.Join(t.TempDir(), "changed.exe")
	os.WriteFile(changed, body, 0o755)
	if err := authenticodeTrusted(changed); !errors.Is(err, windows.Errno(windows.TRUST_E_BAD_DIGEST)) {
		t.Errorf("changed after signing: %v", err)
	}
	text := filepath.Join(t.TempDir(), "notes.txt")
	os.WriteFile(text, []byte("not a program"), 0o644)
	for _, c := range []struct {
		path, team, why string
	}{
		{signed, "", ""},
		{exe, "", ""},
		{signed, who, ""},
		{signed, "CN=Someone Else,O=Someone Else", "isn't signed by Mouse Party's developer"},
		{changed, who, "signature doesn't check"},
		{exe, who, "signature doesn't check"},
		{text, "", "isn't a Windows program"},
	} {
		if why := checkInstaller(c.path, c.team); (c.why == "") != (why == "") || !strings.Contains(why, c.why) {
			t.Errorf("%s for %q: %q", filepath.Base(c.path), c.team, why)
		}
	}
}

func TestInstallerLine(t *testing.T) {
	setup := `C:\Users\Ann Lee\AppData\Local\Mouse Party\update\MouseParty-windows-x86_64-setup.exe`
	root := `C:\Users\Ann Lee\AppData\Local\Programs\Mouse Party`
	if got, want := installerLine(setup, root, false), `"`+setup+`" /S /D=`+root; got != want {
		t.Errorf("quitting: %s", got)
	}
	if got, want := installerLine(setup, root, true), `"`+setup+`" /S /R /D=`+root; got != want {
		t.Errorf("Restart to Update: %s", got)
	}
}

func fakeSetupInstall(t *testing.T, installer bool) string {
	t.Helper()
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	program, err := os.ReadFile(exe)
	if err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(t.TempDir(), "Programs", "Mouse Party")
	os.MkdirAll(root, 0o755)
	installed := filepath.Join(root, "MouseParty.exe")
	os.WriteFile(installed, program, 0o755)
	if installer {
		os.WriteFile(filepath.Join(root, "uninstall.exe"), program, 0o755)
	}
	return installed
}

func TestThisBundleWindows(t *testing.T) {
	installed := fakeSetupInstall(t, false)
	a := &App{bundlePath: installed}
	if _, why := a.thisBundle(); !strings.Contains(why, "installer") {
		t.Errorf("a copy that wasn't installed: %q", why)
	}
	if how := a.updateByHand(); how != "get its installer from "+updatesPage {
		t.Errorf("a copy that wasn't installed: %q", how)
	}
	installed = fakeSetupInstall(t, true)
	a.bundlePath = installed
	if path, why := a.thisBundle(); path != installed || why != "" {
		t.Errorf("installed: %q %q", path, why)
	}
	if how := a.updateByHand(); how != "" {
		t.Errorf("installed: %q", how)
	}
}

func TestUpdateSetup(t *testing.T) {
	for _, restart := range []bool{false, true} {
		t.Run(fmt.Sprint("restart=", restart), func(t *testing.T) {
			tempHome(t)
			withAppVersion(t, "3.0.0")
			exe, fakes := fakeTool(t, "installer")
			started := filepath.Join(fakes, "started")
			program, err := os.ReadFile(exe)
			if err != nil {
				t.Fatal(err)
			}
			sum := sha256.Sum256(program)
			good := hex.EncodeToString(sum[:])
			installed := fakeSetupInstall(t, true)
			var served atomic.Value
			served.Store(strings.Repeat("0", 64))
			standInGitHub(t, func(asset func(name, sum string) map[string]any) []map[string]any {
				sum := served.Load().(string)
				return []map[string]any{
					{"tag_name": "v9.9.0", "html_url": "https://github.com/ftrain/mouseparty/releases/tag/v9.9.0", "assets": []any{asset(updateAsset, sum)}},
					{"tag_name": "v3.0.0", "assets": []any{asset(updateAsset, sum)}},
				}
			}, func(name string) []byte {
				if name == updateAsset {
					return program
				}
				return nil
			})
			a := NewApp(standby)
			a.bundlePath = installed
			go a.run()
			defer a.shutdown(nil)
			a.CheckForUpdates()
			s := untilUpdate(t, a, "refused", func(s UpdateStatus) bool { return s.State == "error" })
			if !strings.Contains(s.Text, "SHA-256") {
				t.Errorf("why: %q", s.Text)
			}
			served.Store(good)
			a.CheckForUpdates()
			s = untilUpdate(t, a, "ready", func(s UpdateStatus) bool { return s.Ready })
			if s.Latest != "9.9.0" || !strings.Contains(s.Text, "9.9.0 is ready") || s.Manual {
				t.Errorf("ready: %+v", s)
			}
			if log := a.LogText(); !strings.Contains(log, "9.9.0 is downloaded: it goes in when Mouse Party quits (or Settings > General's Restart to Update)") {
				t.Errorf("the log says:\n%s", log)
			}
			dir, _ := updateDir()
			staged := filepath.Join(dir, updateAsset)
			if _, err := os.Stat(staged); err != nil {
				t.Fatalf("the installer isn't kept for quitting: %v", err)
			}
			if restart {
				a.RestartToUpdate()
			}
			a.shutdown(nil)
			var got []byte
			for end := time.Now().Add(20 * time.Second); time.Now().Before(end) && len(got) == 0; time.Sleep(100 * time.Millisecond) {
				got, _ = os.ReadFile(started)
			}
			if want := installerLine(staged, filepath.Dir(installed), restart); string(got) != want {
				t.Errorf("the installer was started as %q, not %q", got, want)
			}
			if s := a.Prefs().Update; s.Ready {
				t.Errorf("after quitting: %+v", s)
			}
		})
	}
}

func TestUpdateToldWindows(t *testing.T) {
	tempHome(t)
	withAppVersion(t, "3.0.0")
	page := "https://github.com/ftrain/mouseparty/releases/tag/v9.9.0"
	github := standInGitHub(t, func(asset func(name, sum string) map[string]any) []map[string]any {
		return []map[string]any{{"tag_name": "v9.9.0", "html_url": page, "assets": []any{asset(updateAsset, strings.Repeat("ab", 32))}}}
	}, nil)
	a := NewApp(standby)
	a.bundlePath = fakeSetupInstall(t, false)
	go a.run()
	defer a.shutdown(nil)
	a.CheckForUpdates()
	s := untilUpdate(t, a, "told", func(s UpdateStatus) bool { return s.State == "available" })
	if s.Text != "Mouse Party 9.9.0 is out: get its installer from "+updatesPage+"." || s.Page != page || !s.Manual || s.Ready {
		t.Errorf("told: %+v", s)
	}
	if n := github.fetches.Load(); n != 0 {
		t.Errorf("a copy that wasn't installed downloaded the update %d times", n)
	}
}
