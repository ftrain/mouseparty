package main

// The pages in a browser: the window (frontend/) against the real App, and
// viewers' pages against what it hosts, driven by headless Chromium
// (web/e2e/browser.cjs, Playwright). What no other test runs: the pages'
// JavaScript itself.
//
// The window has no Wails here. Stand-ins for window.go and window.runtime
// (windowShim) send every App call to this test over HTTP, which makes it on
// the real App, and hand the page the app's View as Wails's "view" event would,
// and the Party menu's asks as its "ask" event would.
// The script then walks the window at random (files dropped, Play, rows clicked,
// double-clicked and dragged, keys, the slider), checking after each step that
// the page shows the view it was last given; then two viewers open every app,
// talk in the chat, and call each other, while four robot viewers (plain
// sockets) send each app its commands from the graph (apps.Commands) at random,
// so the pages draw it in states a walk alone wouldn't reach. Any uncaught error
// on a page fails it.
//
// Needs node with Playwright and its Chromium, ffmpeg and MediaMTX; it skips
// without them, and with -short. Hosts on free ports with a temporary HOME.

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ftrain/mouseparty/apps"
)

// windowShim: the Wails runtime and bindings, as far as the window uses them,
// over HTTP to the test
const windowShim = `
const call = (method) => async (...args) => {
    const r = await fetch('/rpc/' + method, { method: 'POST', body: JSON.stringify(args) });
    if (!r.ok) throw new Error(method + ': ' + (await r.text()));
    return r.json();
};
window.go = { main: { App: new Proxy({}, { get: (_, method) => call(method) }) } };
const viewers = [], asks = [];
let drop = null;
window.runtime = {
    OnFileDrop(callback) { drop = callback; },
    EventsOn(name, callback) { (name === 'view' ? viewers : asks).push(callback); return () => {}; },
};
window.__ask = (mode) => asks.forEach((f) => f(mode)); // the Party menu
// Wails sends the view after every change; here it's asked for, five times a second
window.__view = null;
setInterval(async () => {
    let v;
    try {
        v = await call('GetView')();
    } catch (e) {
        return; // the app between quitting and opening again
    }
    window.__view = v;
    for (const f of viewers) f(v);
}, 200);
window.__drop = (x, y, paths) => drop && drop(x, y, paths);
`

// rpc: a call from the window's page, made on the App as Wails would
func rpc(a *App) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		m := reflect.ValueOf(a).MethodByName(r.PathValue("method"))
		if !m.IsValid() {
			http.Error(w, "no such method", http.StatusNotFound)
			return
		}
		var raw []json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&raw); err != nil || len(raw) != m.Type().NumIn() {
			http.Error(w, fmt.Sprintf("arguments: %v (%d of %d)", err, len(raw), m.Type().NumIn()), http.StatusBadRequest)
			return
		}
		args := make([]reflect.Value, len(raw))
		for i := range raw {
			p := reflect.New(m.Type().In(i))
			if err := json.Unmarshal(raw[i], p.Interface()); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			args[i] = p.Elem()
		}
		var out any
		if res := m.Call(args); len(res) > 0 {
			out = res[0].Interface()
		}
		writeJSON(w, out)
	}
}

// playwrightNode: node, if it has Playwright
func playwrightNode() string {
	node := findTool("node")
	if node == "" || exec.Command(node, "-e", "require.resolve('playwright')").Run() != nil {
		return ""
	}
	return node
}

func TestBrowser(t *testing.T) {
	node := playwrightNode()
	if testing.Short() || node == "" || findTool("mediamtx") == "" || findTool("ffmpeg") == "" {
		t.Skip("needs node with Playwright, ffmpeg and mediamtx (and not -short)")
	}
	files, err := makeWindowFiles()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", t.TempDir()) // never the real party file
	// the app, as the Mac starts it: again after a restart, from the same party file (sealed, by then)
	start := func() *App {
		a := NewApp(standby)
		a.hostSetup = func(h *Host) {
			h.HTTPPort, h.ICEPort, h.MapPorts, h.CleanLeftovers, h.Cloudflared = freePort(), freeICEPort(), false, false, ""
		}
		go a.run()
		go a.watchFiles()
		a.wait(func() {
			if !a.locked {
				a.cfg.Countdown = 1
			}
		})
		return a
	}
	var current atomic.Pointer[App]
	current.Store(start())
	defer func() { current.Load().shutdown(nil) }()

	window, _ := fs.Sub(os.DirFS("."), "frontend")
	mux := http.NewServeMux()
	mux.HandleFunc("GET /window/{$}", func(w http.ResponseWriter, r *http.Request) {
		page, _ := fs.ReadFile(window, "index.html") // the stand-ins first, then the window's own script
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(strings.Replace(string(page), `<script type="module"`, `<script src="/shim.js"></script><script type="module"`, 1)))
	})
	mux.Handle("GET /window/", http.StripPrefix("/window/", http.FileServerFS(window)))
	mux.HandleFunc("GET /shim.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/javascript")
		io.WriteString(w, windowShim)
	})
	mux.HandleFunc("POST /rpc/{method}", func(w http.ResponseWriter, r *http.Request) { rpc(current.Load())(w, r) })
	mux.HandleFunc("POST /restart", func(w http.ResponseWriter, r *http.Request) { // the app quit and opened again
		current.Load().shutdown(nil)
		current.Store(start())
		writeJSON(w, true)
	})
	mux.HandleFunc("GET /files", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, files) })
	mux.HandleFunc("GET /commands", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, apps.Commands) }) // for the robots
	mux.HandleFunc("GET /viewer", func(w http.ResponseWriter, r *http.Request) {                                  // the link, once there is one
		link, a := "", current.Load()
		a.wait(func() { link = a.link() })
		writeJSON(w, link)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	seed := os.Getenv("BROWSER_SEED")
	if seed == "" {
		seed = fmt.Sprint(time.Now().UnixNano() % 1e6)
	}
	cmd := exec.Command(node, "web/e2e/browser.cjs", srv.URL, seed)
	cmd.Stderr = cmd.Stdout
	out, _ := cmd.StdoutPipe()
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		for lines := bufio.NewScanner(out); lines.Scan(); {
			t.Log(lines.Text())
		}
	}()
	timer := time.AfterFunc(6*time.Minute, func() { cmd.Process.Kill() })
	defer timer.Stop()
	<-done
	if err := cmd.Wait(); err != nil {
		t.Fatalf("the browser walk failed (%v): BROWSER_SEED=%s go test -run TestBrowser -v . walks it again", err, seed)
	}
}
