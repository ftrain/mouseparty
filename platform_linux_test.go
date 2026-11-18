package main

import (
	"bufio"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Erase All Data takes WebKitGTK's folders of the app's own names (its id, and argv[0]'s when that
// is one of the app's), never one another program could have, such as an AppImage's AppRun
func TestWebViewFoldersAreTheAppsOwn(t *testing.T) {
	tempHome(t)
	was := os.Args[0]
	defer func() { os.Args[0] = was }()
	named := func(argv0 string) []string {
		os.Args[0] = argv0
		var names []string
		for _, p := range webviewFolders() {
			if filepath.Dir(p) != filepath.Join(os.Getenv("XDG_CONFIG_HOME")) {
				names = append(names, strings.TrimPrefix(p, os.Getenv("HOME")+string(filepath.Separator)))
			}
		}
		return names
	}
	if got := strings.Join(named("/tmp/.mount_x/AppRun"), " "); got != ".local/share/io.github.ftrain.mouseparty .cache/io.github.ftrain.mouseparty" {
		t.Fatal(got)
	}
	if got := strings.Join(named("/usr/bin/mouseparty"), " "); got != ".local/share/io.github.ftrain.mouseparty .local/share/mouseparty "+
		".cache/io.github.ftrain.mouseparty .cache/mouseparty" {
		t.Fatal(got)
	}
	if got := named("/home/me/Apps/MouseParty-linux-x86_64.AppImage"); len(got) != 4 || !strings.HasSuffix(got[1], "/MouseParty-linux-x86_64.AppImage") {
		t.Fatal(got)
	}
}

func init() {
	fakeTools["unpacking-runtime"] = fakeUnpackingRuntime
	fakeTools["unpacked-app"] = fakeUnpackedApp
	fakeTools["viewer-pages"] = fakeViewerPages
}

func fakeUnpackingRuntime([]string) int {
	app := exec.Command(os.Args[0])
	app.Env = append(os.Environ(), fakeToolEnv+"=unpacked-app")
	if app.Run() != nil {
		return 1
	}
	time.Sleep(time.Second)
	os.WriteFile(filepath.Join(os.Getenv(fakeDirEnv), "runtime gone"), nil, 0o600)
	return 0
}

func fakeUnpackedApp([]string) int {
	dir := os.Getenv(fakeDirEnv)
	if fakeCount("runs") == 1 {
		then(os.Getenv("APPIMAGE"))
		return 0
	}
	_, err := os.Stat(filepath.Join(dir, "runtime gone"))
	os.WriteFile(filepath.Join(dir, "reopened"), []byte(os.Getenv("APPIMAGE_EXTRACT_AND_RUN")+" "+strconv.FormatBool(err == nil)), 0o600)
	return 0
}

func appImageEnv(env []string, appDir, image string) []string {
	var out []string
	for _, kv := range env {
		if !strings.HasPrefix(kv, "APPDIR=") && !strings.HasPrefix(kv, "APPIMAGE") {
			out = append(out, kv)
		}
	}
	return append(out, "APPDIR="+appDir, "APPIMAGE="+image)
}

// An AppImage run unpacked (no FUSE) opens again unpacked, once the runtime that unpacked it has
// gone (it deletes what it unpacked, where unpacking it again would go); run any other way, as it was
func TestThenReopensAnUnpackedAppImage(t *testing.T) {
	gone := exec.Command(os.Args[0], "-test.run=^$")
	if err := gone.Run(); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	unpacked := filepath.Join(dir, "appimage_extracted_0123456789abcdef0123456789abcdef")
	for _, c := range []struct{ name, appDir, image string }{
		{"Mounted.AppImage", filepath.Join(dir, ".mount_MousePa1b2c3"), ""},
		{"mouseparty", unpacked, os.Args[0]},
	} {
		open := filepath.Join(dir, c.name)
		os.WriteFile(open, []byte("#!/bin/sh\nenv > \"$0.tmp\" && mv \"$0.tmp\" \"$0.env\"\n"), 0o700)
		if c.image == "" {
			c.image = open
		}
		helper := exec.Command(os.Args[0], thenArg, strconv.Itoa(gone.Process.Pid), open)
		helper.Env = appImageEnv(os.Environ(), c.appDir, c.image)
		if out, err := helper.CombinedOutput(); err != nil {
			t.Fatal(err, string(out))
		}
		var env []byte
		for end := time.Now().Add(10 * time.Second); env == nil && time.Now().Before(end); time.Sleep(50 * time.Millisecond) {
			env, _ = os.ReadFile(open + ".env")
		}
		if env == nil || strings.Contains(string(env), "APPIMAGE_EXTRACT_AND_RUN") {
			t.Fatalf("%s: %q", c.name, env)
		}
	}

	runtimeExe, state := fakeTool(t, "unpacking-runtime")
	unpacking := exec.Command(runtimeExe)
	unpacking.Env = appImageEnv(os.Environ(), unpacked, runtimeExe)
	if out, err := unpacking.CombinedOutput(); err != nil {
		t.Fatal(err, string(out))
	}
	var reopened []byte
	for end := time.Now().Add(15 * time.Second); reopened == nil && time.Now().Before(end); time.Sleep(50 * time.Millisecond) {
		reopened, _ = os.ReadFile(filepath.Join(state, "reopened"))
	}
	if string(reopened) != "1 true" {
		t.Fatalf("reopened (unpacked, after its runtime): %q", reopened)
	}
}

// The viewer's pages come from the installed resources/host_web, read on every request, until the
// app's own program is replaced (dnf upgrading the RPM while it runs): then they're the ones built
// into the program that's running, never the next version's beside it
func TestViewerPagesAreTheRunningApps(t *testing.T) {
	exe, _ := fakeTool(t, "viewer-pages")
	root := t.TempDir()
	app := filepath.Join(root, "mouseparty")
	if os.Link(exe, app) != nil {
		b, err := os.ReadFile(exe)
		if err == nil {
			err = os.WriteFile(app, b, 0o755)
		}
		if err != nil {
			t.Fatal(err)
		}
	}
	pages := filepath.Join(root, "resources", "host_web")
	os.MkdirAll(pages, 0o755)
	if err := os.WriteFile(filepath.Join(pages, "viewer.html"), []byte("this version's page"), 0o644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(app)
	cmd.Stderr = os.Stderr
	in, _ := cmd.StdinPipe()
	out, _ := cmd.StdoutPipe()
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer cmd.Wait()
	defer in.Close()
	said := bufio.NewReader(out)
	if before, err := said.ReadString(0); before != "this version's page\x00" {
		t.Fatalf("before: %q %v", before, err)
	}
	os.WriteFile(app+".new", []byte("the next version"), 0o755)
	if err := os.Rename(app+".new", app); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(pages, "viewer.html"), []byte("the next version's page"), 0o644)
	in.Write([]byte("\n"))
	after, _ := io.ReadAll(said)
	built, err := fs.ReadFile(hostWeb, "host_web/viewer.html")
	if err != nil || len(built) == 0 || string(after) != string(built) {
		t.Fatalf("after: %.80q", after)
	}
}

func fakeViewerPages([]string) int {
	web := viewerFiles()
	before, err := fs.ReadFile(web, "viewer.html")
	if err != nil {
		return 1
	}
	os.Stdout.Write(append(before, 0))
	bufio.NewReader(os.Stdin).ReadString('\n')
	after, err := fs.ReadFile(web, "viewer.html")
	if err != nil {
		return 1
	}
	os.Stdout.Write(after)
	return 0
}
