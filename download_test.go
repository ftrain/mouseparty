package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// A download link: added as a row counting its bytes, then a movie like any
// other, in the cache under the link's own folder; a link the server names
// (Content-Disposition) takes that name; a dead link's row says so and is tried
// again when double-clicked; removing the row deletes its folder; at the next
// start, an unfinished download goes on and strays in the cache are deleted.
// Needs ffmpeg for the clip.
func TestDownloadLink(t *testing.T) {
	if findTool("ffmpeg") == "" {
		t.Skip("needs ffmpeg")
	}
	t.Setenv("HOME", t.TempDir()) // never the real party file, nor the real cache
	t.Setenv("XDG_CACHE_HOME", "")
	dir := t.TempDir()
	clip := filepath.Join(dir, "Some.Clip.2026.mkv")
	out, err := exec.Command(findTool("ffmpeg"), "-v", "error", "-f", "lavfi", "-i", "testsrc=s=320x240:r=30:d=3",
		"-f", "lavfi", "-i", "sine=f=440:d=3", "-c:v", "libx264", "-c:a", "libopus", clip).CombinedOutput()
	if err != nil {
		t.Fatal(err, string(out))
	}
	var dead atomic.Bool
	dead.Store(true)
	mux := http.NewServeMux()
	mux.Handle("/files/", http.StripPrefix("/files/", http.FileServer(http.Dir(dir))))
	mux.HandleFunc("/dl", func(w http.ResponseWriter, r *http.Request) { // named by the server, not the link
		w.Header().Set("Content-Disposition", `attachment; filename="Named.Clip.mkv"`)
		http.ServeFile(w, r, clip)
	})
	mux.HandleFunc("/flaky.mkv", func(w http.ResponseWriter, r *http.Request) { // dead until it isn't
		if dead.Load() {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, clip)
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	newApp := func() *App {
		a := NewApp(standby)
		a.hostSetup = func(h *Host) { // never the default ports (CLAUDE.md)
			h.HTTPPort, h.ICEPort, h.MapPorts, h.CleanLeftovers, h.Cloudflared = freePort(), freeICEPort(), false, false, ""
		}
		go a.run()
		return a
	}
	a := newApp()
	defer a.shutdown(nil)
	until := func(what string, ok func(View) bool) View {
		t.Helper()
		for end := time.Now().Add(20 * time.Second); time.Now().Before(end); time.Sleep(50 * time.Millisecond) {
			if v := a.GetView(); ok(v) {
				return v
			}
		}
		t.Fatalf("never: %s (%+v)", what, a.GetView())
		return View{}
	}

	for _, bad := range []string{"", "Some.Clip.mkv", "ftp://x/y.mkv", "http://"} {
		if why := a.AddURL(bad); !strings.Contains(why, "web link") {
			t.Errorf("AddURL(%q): %q", bad, why)
		}
	}
	link := server.URL + "/files/Some.Clip.2026.mkv"
	if why := a.AddURL(link); why != "" {
		t.Fatal(why)
	}
	if why := a.AddURL(link + "#top"); !strings.Contains(why, "already") {
		t.Errorf("the same link twice: %q", why)
	}
	v := a.GetView()
	if len(v.Rows) != 1 || v.Rows[0].Title != "Some Clip 2026" || !v.Rows[0].Off {
		t.Fatalf("just added: %+v", v)
	}
	v = until("downloaded", func(v View) bool { return !v.Rows[0].Off })
	if r := v.Rows[0]; r.Icon != "video" || r.Length != "0:00:03" || r.Title != "Some Clip 2026" {
		t.Fatalf("downloaded: %+v", r)
	}
	var it *Item
	a.wait(func() { it = a.cfg.Queue[0] })
	if !it.Got || it.dl != nil || it.Kind != "video" || it.Subtitles == nil || filepath.Dir(filepath.Dir(it.Path)) != downloadsDir() {
		t.Fatalf("the row: %+v", it)
	}
	if st, err := os.Stat(it.Path); err != nil || st.Size() == 0 {
		t.Fatal("the file isn't in the cache:", err)
	}

	// the server's name for it
	if why := a.AddURL(server.URL + "/dl?id=7"); why != "" {
		t.Fatal(why)
	}
	v = until("the named one downloaded", func(v View) bool { return len(v.Rows) == 2 && !v.Rows[1].Off })
	if v.Rows[1].Title != "Named Clip" {
		t.Fatalf("named by the server: %+v", v.Rows[1])
	}

	// a dead link: its row says so, and double-clicking it tries again
	if why := a.AddURL(server.URL + "/flaky.mkv"); why != "" {
		t.Fatal(why)
	}
	v = until("the dead one gave up", func(v View) bool {
		return len(v.Rows) == 3 && v.Rows[2].Icon == "download" && v.Rows[2].Length == "not downloaded"
	})
	if !strings.Contains(v.Rows[2].Title, "404") || !v.Rows[2].Off {
		t.Fatalf("dead: %+v", v.Rows[2])
	}
	dead.Store(false)
	a.PlayRow(2)
	until("tried again, and down", func(v View) bool { return !v.Rows[2].Off && v.Rows[2].Icon == "video" })

	// removing a row removes its folder; the others stay
	var removed *Item
	a.wait(func() { removed = a.cfg.Queue[1]; a.selectRow(1); a.remove() })
	if _, err := os.Stat(filepath.Dir(removed.Path)); !os.IsNotExist(err) {
		t.Fatal("the removed row's folder is still there:", err)
	}
	if _, err := os.Stat(it.Path); err != nil {
		t.Fatal("another row's file went too:", err)
	}
	if entries, _ := os.ReadDir(downloadsDir()); len(entries) != 2 {
		t.Fatalf("%d folders in the cache, not 2", len(entries))
	}
	a.wait(func() { it = a.cfg.Queue[0] })

	// the cache limit: room is made by clearing the download played longest ago; a link bigger than it is refused
	var size int64
	a.wait(func() {
		st, _ := os.Stat(it.Path)
		size = st.Size()
		a.cfg.CacheGB = Number(float64(size+size/2) / (1 << 30))
	})
	if why := a.AddURL(server.URL + "/files/Some.Clip.2026.mkv?again=1"); why != "" {
		t.Fatal(why)
	}
	v = until("the newest down, the oldest cleared", func(v View) bool {
		return len(v.Rows) == 3 && !v.Rows[2].Off && v.Rows[0].Off && v.Rows[0].Length == "not in the cache"
	})
	if cacheSize() > size+size/2 || !v.Rows[1].Off || v.Rows[1].Length != "not in the cache" {
		t.Fatalf("after trimming: %s in the cache, %+v", formatBytes(cacheSize()), v.Rows)
	}
	a.wait(func() { a.cfg.CacheGB = Number(float64(size/2) / (1 << 30)) })
	a.PlayRow(0)
	v = until("too big for the cache", func(v View) bool { return strings.Contains(v.Rows[0].Title, "bigger than the cache limit") })
	if _, err := os.Stat(filepath.Dir(it.Path)); err == nil {
		if entries, _ := os.ReadDir(filepath.Dir(it.Path)); len(entries) != 0 {
			t.Fatalf("a refused download left %d files", len(entries))
		}
	}
	a.wait(func() { a.cfg.CacheGB = 0 })

	// Clear Download Cache: every download gone, every row kept, each a double-click from coming back
	if text := a.CacheText(); !strings.HasPrefix(text, "1 download, ") {
		t.Fatalf("CacheText: %q", text)
	}
	if why := a.ClearCache(); why != "" {
		t.Fatal(why)
	}
	v = a.GetView()
	for i, r := range v.Rows {
		if !r.Off || r.Icon != "download" || r.Length != "not in the cache" {
			t.Fatalf("row %d after clearing: %+v", i, r)
		}
	}
	if entries, _ := os.ReadDir(downloadsDir()); len(entries) != 0 || a.CacheText() != "" {
		t.Fatalf("%d folders after clearing, %q", len(entries), a.CacheText())
	}
	a.PlayRow(0)
	until("downloaded again after clearing", func(v View) bool { return !v.Rows[0].Off })
	a.wait(func() { a.selectRow(2); a.remove(); a.selectRow(1); a.remove() })

	// started again: a download that didn't finish goes on, and a stray folder is cleaned out
	a.wait(func() {
		a.cfg.Queue[0].Got = false
		os.Remove(a.cfg.Queue[0].Path)
		a.save()
	})
	os.MkdirAll(filepath.Join(downloadsDir(), "0123456789abcdef"), 0o755)
	a.shutdown(nil)
	a = newApp()
	defer a.shutdown(nil)
	a.wait(a.started)
	if entries, _ := os.ReadDir(downloadsDir()); len(entries) != 1 {
		t.Fatalf("%d folders in the cache after a start, not 1", len(entries))
	}
	until("downloaded again after a start", func(v View) bool { return len(v.Rows) == 1 && !v.Rows[0].Off })
}

// fetch goes on from what's there (Range), takes the server's name, and says why when it can't
func TestFetch(t *testing.T) {
	dir := t.TempDir()
	body := []byte(strings.Repeat("0123456789", 1000))
	var ranges []string
	mux := http.NewServeMux()
	mux.HandleFunc("/file.bin", func(w http.ResponseWriter, r *http.Request) {
		ranges = append(ranges, r.Header.Get("Range"))
		http.ServeContent(w, r, "file.bin", time.Time{}, strings.NewReader(string(body)))
	})
	mux.HandleFunc("/named", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Disposition", `attachment; filename="../../up/Named File.bin"`)
		w.Write(body)
	})
	mux.HandleFunc("/short", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "100")
		w.Write(body[:50])
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	quiet := func(string, int64, int64) {}

	path := filepath.Join(dir, "a", "file.bin")
	os.MkdirAll(filepath.Dir(path), 0o755)
	os.WriteFile(path, body[:4000], 0o644)
	got, err := fetch(t.Context(), server.URL+"/file.bin", path, quiet)
	if err != nil || got != path {
		t.Fatal(got, err)
	}
	if b, _ := os.ReadFile(path); string(b) != string(body) {
		t.Fatalf("the file is %d bytes, not %d", len(b), len(body))
	}
	if len(ranges) != 1 || ranges[0] != "bytes=4000-" {
		t.Fatalf("asked for %v", ranges)
	}

	got, err = fetch(t.Context(), server.URL+"/named", filepath.Join(dir, "b", "named"), quiet)
	if err != nil || got != filepath.Join(dir, "b", "Named File.bin") {
		t.Fatal(got, err)
	}
	if _, err := os.Stat(got); err != nil {
		t.Fatal(err)
	}

	for link, want := range map[string]string{
		server.URL + "/missing": "404 Not Found",
		server.URL + "/short":   "cut short",
		"http://127.0.0.1:1/x":  "refused",
	} {
		if _, err := fetch(t.Context(), link, filepath.Join(dir, "c", "x"), quiet); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: %v, not %q", link, err, want)
		}
	}
}

func TestLinkName(t *testing.T) {
	for link, want := range map[string]string{
		"https://example.com/dl/Some.Movie.2026.1080p.mkv?sig=abc": "Some.Movie.2026.1080p.mkv",
		"https://example.com/dl/Some%20Movie.mkv/":                 "Some Movie.mkv",
		"https://example.com/":                                     "download",
		"https://example.com":                                      "download",
		"https://example.com/..":                                   "download",
		"https://example.com/.hidden":                              "hidden",
	} {
		u, why := checkLink(link)
		if why != "" {
			t.Fatal(link, why)
		}
		if got := linkName(u); got != want {
			t.Errorf("%s: %q, not %q", link, got, want)
		}
	}
	if _, why := checkLink(" https://example.com/x.mkv "); why != "" {
		t.Error(why)
	}
	for _, bad := range []string{"", "x.mkv", "file:///etc/passwd", "https://", "mailto:a@b"} {
		if _, why := checkLink(bad); why == "" {
			t.Errorf("%q passed", bad)
		}
	}
}

// A movie plays while it downloads: served slower than it plays, it starts once ffmpeg can
// read what's there, runs out of file, waits for more, goes on from where it was, and ends
// when the whole of it has played. Needs ffmpeg (with drawtext) and MediaMTX, on free ports.
func TestPlayWhileDownloading(t *testing.T) {
	if findTool("mediamtx") == "" || findTool("ffmpeg") == "" {
		t.Skip("needs mediamtx and ffmpeg")
	}
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CACHE_HOME", "")
	clip := filepath.Join(t.TempDir(), "Slow.Clip.mkv")
	out, err := exec.Command(findTool("ffmpeg"), "-v", "error", "-f", "lavfi", "-i", "testsrc=s=320x240:r=30:d=8",
		"-f", "lavfi", "-i", "sine=f=440:d=8", "-c:v", "libx264", "-c:a", "libopus", clip).CombinedOutput()
	if err != nil {
		t.Fatal(err, string(out))
	}
	body, _ := os.ReadFile(clip)
	// the clip over about 48 seconds: a sixth as fast as it plays
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", strconv.Itoa(len(body)))
		chunk := len(body) / 64
		for i := 0; i < len(body); i += chunk {
			w.Write(body[i:min(len(body), i+chunk)])
			w.(http.Flusher).Flush()
			time.Sleep(750 * time.Millisecond)
		}
	}))
	defer server.Close()

	a := NewApp(standby)
	a.hostSetup = func(h *Host) {
		h.HTTPPort, h.ICEPort, h.MapPorts, h.CleanLeftovers, h.Cloudflared = freePort(), freeICEPort(), false, false, ""
	}
	go a.run()
	go a.watchFiles()
	defer a.shutdown(nil)
	a.wait(func() { a.cfg.Countdown = 1 })
	state := func() (s string) { a.wait(func() { s = a.state() }); return }
	until := func(what string, seconds int, ok func(View) bool) View {
		t.Helper()
		for end := time.Now().Add(time.Duration(seconds) * time.Second); time.Now().Before(end); time.Sleep(100 * time.Millisecond) {
			if v := a.GetView(); ok(v) {
				return v
			}
		}
		t.Fatalf("never: %s (%+v, %s)", what, a.GetView(), state())
		return View{}
	}
	if why := a.AddURL(server.URL + "/Slow.Clip.mkv"); why != "" {
		t.Fatal(why)
	}
	v := until("playable while downloading", 40, func(v View) bool { return v.PlayOn && len(v.Rows) == 1 && !v.Rows[0].Off })
	if r := v.Rows[0]; r.Icon != "download" || !strings.HasPrefix(r.Length, "0:00:08 · ") {
		t.Fatalf("playable: %+v", r)
	}
	a.PlayClicked()
	until("playing", 10, func(View) bool { return state() == "movie" })
	a.Seek(7) // further than the download has come: only as far as it has
	v = until("the seek held back", 10, func(v View) bool { return state() == "movie" && v.Slider.On })
	if v.Slider.Value >= 7 {
		t.Fatalf("sought to %v, past the download", v.Slider.Value)
	}
	until("ran out of file, waiting for more", 30, func(View) bool {
		var waiting bool
		a.wait(func() { waiting = a.resume != nil })
		return state() == "between" && waiting
	})
	until("going on", 30, func(View) bool { return state() == "movie" })
	until("the download done", 60, func(v View) bool { return v.Rows[0].Icon == "video" })
	until("played to the end", 40, func(v View) bool {
		var pos int
		a.wait(func() { pos = a.cfg.Position })
		return v.Play == "play" && pos == 1
	})
	if v := a.GetView(); v.Rows[0].Length != "0:00:08" || v.Rows[0].Off {
		t.Fatalf("after: %+v", v.Rows[0])
	}
}
