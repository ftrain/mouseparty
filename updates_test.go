package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
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

var everyUpdateAsset = []string{"MouseParty-macos-arm64.dmg", "MouseParty-linux-x86_64.AppImage", "MouseParty-windows-x86_64-setup.exe"}

type gitHubStandIn struct {
	*httptest.Server
	fetches atomic.Int32
}

func standInGitHub(t *testing.T, releases func(asset func(name, sum string) map[string]any) []map[string]any, file func(name string) []byte) *gitHubStandIn {
	t.Helper()
	g := &gitHubStandIn{}
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/releases" {
			g.fetches.Add(1)
			if body := standInFile(file, strings.TrimPrefix(r.URL.Path, "/")); body != nil {
				w.Write(body)
				return
			}
			http.NotFound(w, r)
			return
		}
		json.NewEncoder(w).Encode(releases(func(name, sum string) map[string]any {
			a := map[string]any{"name": name, "browser_download_url": server.URL + "/" + name, "size": 1234}
			if body := standInFile(file, name); body != nil {
				a["size"] = len(body)
			}
			if sum != "" {
				a["digest"] = "sha256:" + sum
			}
			return a
		}))
	}))
	t.Cleanup(server.Close)
	was := updatesAPI
	updatesAPI = server.URL + "/releases"
	t.Cleanup(func() { updatesAPI = was })
	g.Server = server
	return g
}

func standInFile(file func(name string) []byte, name string) []byte {
	if file == nil {
		return nil
	}
	return file(name)
}

func untilUpdate(t *testing.T, a *App, what string, ok func(UpdateStatus) bool) UpdateStatus {
	t.Helper()
	for end := time.Now().Add(20 * time.Second); time.Now().Before(end); time.Sleep(50 * time.Millisecond) {
		if s := a.Prefs().Update; ok(s) {
			return s
		}
	}
	t.Fatalf("never: %s (%+v)", what, a.Prefs().Update)
	return UpdateStatus{}
}

func withAppVersion(t *testing.T, v string) {
	t.Helper()
	was := version
	version = v
	t.Cleanup(func() { version = was })
}

func TestLatestRelease(t *testing.T) {
	sum := strings.Repeat("ab", 32)
	var others []string
	for _, name := range everyUpdateAsset {
		if name != updateAsset {
			others = append(others, name)
		}
	}
	if len(others) != len(everyUpdateAsset)-1 {
		t.Fatalf("%s isn't one of the assets a release has", updateAsset)
	}
	page := "https://github.com/ftrain/mouseparty/releases/tag/v9.9.0"
	standInGitHub(t, func(asset func(name, sum string) map[string]any) []map[string]any {
		every := func(sum string, names ...string) []any {
			var list []any
			for _, n := range names {
				list = append(list, asset(n, sum))
			}
			return list
		}
		return []map[string]any{
			{"tag_name": "v9.9.0", "html_url": page, "assets": append(every(strings.ToUpper(sum), everyUpdateAsset...), asset("MouseParty-v9.9.0-gpl-sources.tar", sum))},
			{"tag_name": "v10.0.0", "draft": true, "assets": every(sum, everyUpdateAsset...)},
			{"tag_name": "v9.11.0", "prerelease": true, "assets": every(sum, everyUpdateAsset...)},
			{"tag_name": "v9.10.0-rc1", "assets": every(sum, everyUpdateAsset...)},
			{"tag_name": "v9.9.5", "assets": every("", everyUpdateAsset...)},
			{"tag_name": "v9.9.6", "assets": every("1234", everyUpdateAsset...)},
			{"tag_name": "v9.9.7", "assets": every(sum, "MouseParty-macos-arm64.zip")},
			{"tag_name": "v9.9.8", "assets": every(sum, others...)},
			{"tag_name": "python-wasm-3.15.2-abc", "assets": every(sum, everyUpdateAsset...)},
			{"tag_name": "v3.0.0", "assets": every(sum, everyUpdateAsset...)},
		}
	}, nil)
	rel, err := latestRelease(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if rel.Version != "9.9.0" || !strings.HasSuffix(rel.URL, "/"+updateAsset) || rel.Sum != sum || rel.Size != 1234 || rel.Page != page {
		t.Errorf("the release: %+v", rel)
	}

	standInGitHub(t, func(asset func(name, sum string) map[string]any) []map[string]any {
		return []map[string]any{{"tag_name": "v9.9.8", "assets": []any{asset(others[0], sum), asset(others[1], sum)}}}
	}, nil)
	if _, err := latestRelease(context.Background()); err == nil || !strings.Contains(err.Error(), "no release") {
		t.Errorf("a release for the other platforms only: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/broken" {
			w.Write([]byte("[{"))
			return
		}
		http.Error(w, "rate limited", http.StatusForbidden)
	}))
	defer server.Close()
	was := updatesAPI
	defer func() { updatesAPI = was }()
	updatesAPI = server.URL + "/releases"
	if _, err := latestRelease(context.Background()); err == nil || !strings.Contains(err.Error(), "403") {
		t.Errorf("GitHub saying no: %v", err)
	}
	updatesAPI = server.URL + "/broken"
	if _, err := latestRelease(context.Background()); err == nil || !strings.Contains(err.Error(), "didn't read") {
		t.Errorf("a list that doesn't read: %v", err)
	}
}

func TestUpdateDir(t *testing.T) {
	tempHome(t)
	if dir, err := updateDir(); err != nil || cacheDir() == "" || dir != filepath.Join(cacheDir(), "update") {
		t.Errorf("the update's folder: %q %v", dir, err)
	}
	for _, name := range []string{"HOME", "XDG_CACHE_HOME", "LOCALAPPDATA"} {
		t.Setenv(name, "")
	}
	if dir, err := updateDir(); err == nil {
		t.Errorf("with no cache folder, the update's folder is %q", dir)
	}
}
