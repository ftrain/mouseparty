package main

import (
	"bufio"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ftrain/mouseparty/apps"
	"github.com/gorilla/websocket"
)

// The chat speaks what host_web/host.js expects: a hello with the history and
// who's here, then joins, messages and leavings
func TestChatJoinSayLeave(t *testing.T) {
	chat := &Chat{hello: func(apps.Viewer) map[string]any { return map[string]any{"subs": "s"} }, conns: map[*chatConn]bool{}}
	srv := httptest.NewServer(http.HandlerFunc(chat.handle))
	defer srv.Close()
	dial := func() *websocket.Conn {
		ws, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
		if err != nil {
			t.Fatal(err)
		}
		return ws
	}
	read := func(ws *websocket.Conn) map[string]any {
		ws.SetReadDeadline(time.Now().Add(3 * time.Second))
		var m map[string]any
		if err := ws.ReadJSON(&m); err != nil {
			t.Fatal(err)
		}
		return m
	}

	a := dial()
	if m := read(a); m["type"] != "hello" || m["subs"] != "s" || len(m["history"].([]any)) != 0 {
		t.Fatal(m)
	}
	a.WriteJSON(map[string]string{"type": "say", "text": "before joining: ignored"})
	a.WriteJSON(map[string]string{"type": "join", "name": "  Ann  "})
	if m := read(a); m["type"] != "system" || m["text"] != "Ann joined" || m["at"] == nil {
		t.Fatal(m)
	}
	if m := read(a); m["type"] != "online" || len(m["online"].([]any)) != 1 {
		t.Fatal(m)
	}
	a.WriteJSON(map[string]string{"type": "say", "text": "hi"})
	if m := read(a); m["type"] != "msg" || m["name"] != "Ann" || m["text"] != "hi" {
		t.Fatal(m)
	}

	b := dial() // a latecomer gets the history
	hello := read(b)
	b2, _ := json.Marshal(hello["history"])
	if !strings.Contains(string(b2), `"Ann joined"`) || !strings.Contains(string(b2), `"hi"`) {
		t.Fatal(string(b2))
	}
	a.Close()
	if m := read(b); m["type"] != "system" || m["text"] != "Ann left" {
		t.Fatal(m)
	}
}

func TestOnlyTheKeyGetsIn(t *testing.T) {
	h := &Host{key: "k3y", urls: map[string]string{}}
	srv := httptest.NewServer(h.onlyWithKey(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("in")) })))
	defer srv.Close()
	for path, want := range map[string]int{"/k3y/": 200, "/nope/": 404, "/": 404, "/k3yx/": 404} {
		resp, err := http.Get(srv.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != want || resp.Header.Get("Cache-Control") != "no-store" {
			t.Errorf("%s: %d %q", path, resp.StatusCode, resp.Header.Get("Cache-Control"))
		}
	}
}

// Cloudflare limits quick tunnels per address and says so at once (a 429): the
// host asks again, and the app hands out no plain http link meanwhile
func TestCloudflareIsAskedAgainAndHTTPIsNeverHandedOut(t *testing.T) {
	if findTool("mediamtx") == "" {
		t.Skip("needs mediamtx")
	}
	tempHome(t)
	retries, settle := tunnelRetries, cfSettle
	tunnelRetries, cfSettle = []time.Duration{0, 50 * time.Millisecond, 50 * time.Millisecond}, 0
	defer func() { tunnelRetries, cfSettle = retries, settle }()

	unboxed(t)
	fake, dir := fakeTool(t, "cloudflared") // says no twice, then gives a link and stays up

	h := NewHost(func(string) {}, findTool("mediamtx"), fake, standby)
	h.HTTPPort, h.ICEPort, h.MapPorts, h.CleanLeftovers = freePort(), freeICEPort(), false, false
	defer h.Stop()
	if err := h.Start(); err != nil {
		t.Fatal(err)
	}
	tries, _ := os.ReadFile(filepath.Join(dir, "tries"))
	if got := h.URLs()["cloudflare"]; !strings.HasPrefix(got, "https://made-up-words-here.trycloudflare.com/"+h.Key()) ||
		strings.TrimSpace(string(tries)) != "3" {
		t.Fatalf("%q after %s tries", got, tries)
	}

	a := &App{host: h} // with cloudflared, only the https link: never the http one in its place
	if a.link() != h.URLs()["cloudflare"] {
		t.Fatal(a.link())
	}
	h.mu.Lock()
	delete(h.urls, "cloudflare")
	h.urls["internet"] = "http://203.0.113.9:8765/k/"
	h.mu.Unlock()
	if a.link() != "" {
		t.Fatalf("handed out %q", a.link())
	}
}

// A call's voices: sent by their secret name to its MediaMTX path, heard by the
// public one; MediaMTX's session URLs come back as the site's own; nothing else gets through
func TestCallVoicesReachTheirPaths(t *testing.T) {
	var got []string
	mtx := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = append(got, r.Method+" "+r.URL.Path)
		if r.Method == "POST" {
			w.Header().Set("Location", r.URL.Path+"/sess1")
			w.Header().Set("Set-Cookie", "x=y")
			w.WriteHeader(201)
		}
	}))
	defer mtx.Close()
	port := mtx.Listener.Addr().(*net.TCPAddr).Port
	h := &Host{key: "k3y", urls: map[string]string{}, ports: map[string]int{"webrtc": port}}
	mux := http.NewServeMux()
	send := h.webrtcProxy("whip", func(r *http.Request) (string, string, bool) {
		v, ok := apps.CallName(r.PathValue("secret"))
		return "call-" + v, "call/send/" + r.PathValue("secret"), ok
	})
	mux.Handle("POST /{key}/call/send/{secret}", send)
	mux.Handle("DELETE /{key}/call/send/{secret}/{session}", send)
	srv := httptest.NewServer(h.onlyWithKey(mux))
	defer srv.Close()

	secret := strings.Repeat("ab", 16)
	voice, _ := apps.CallName(secret)
	resp, err := http.Post(srv.URL+"/k3y/call/send/"+secret, "application/sdp", strings.NewReader("v=0"))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 201 || resp.Header.Get("Location") != "/k3y/call/send/"+secret+"/sess1" || resp.Header.Get("Set-Cookie") != "" {
		t.Fatal(resp.StatusCode, resp.Header)
	}
	req, _ := http.NewRequest("DELETE", srv.URL+resp.Header.Get("Location"), nil)
	http.DefaultClient.Do(req)
	resp, _ = http.Post(srv.URL+"/k3y/call/send/live", "application/sdp", strings.NewReader("v=0"))
	if resp.StatusCode != 404 {
		t.Fatal("sent to the movie's path:", resp.StatusCode)
	}
	want := []string{"POST /call-" + voice + "/whip", "DELETE /call-" + voice + "/whip/sess1"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatal(got)
	}
}

// MediaMTX's loopback ports were free a moment before it starts, but one can be taken before it
// listens (on CI, by an outgoing connection's port): it exits at once, and is started again on
// other ports, not the taken one again. A stand-in exits at once twice, then is the real one.
func TestMediaMTXTriesOtherPorts(t *testing.T) {
	real := findTool("mediamtx")
	if real == "" {
		t.Skip("needs mediamtx")
	}
	tempHome(t)
	unboxed(t) // a box lets its program start no other
	stand, dir := fakeTool(t, "mediamtx")
	t.Setenv(fakeRealEnv, real)
	var said []string
	var mu sync.Mutex
	h := NewHost(func(s string) { mu.Lock(); said = append(said, s); mu.Unlock() }, stand, "", standby)
	h.HTTPPort, h.ICEPort, h.MapPorts, h.CleanLeftovers = freePort(), freeICEPort(), false, false // never the default ports (CLAUDE.md)
	if err := h.Start(); err != nil {
		t.Fatal(err)
	}
	defer h.Stop()
	if runs, _ := os.ReadFile(filepath.Join(dir, "runs")); strings.TrimSpace(string(runs)) != "3" {
		t.Fatalf("MediaMTX ran %s times, not 3", runs)
	}
	if apis, _ := os.ReadFile(filepath.Join(dir, "apis")); len(slices.Compact(slices.Sorted(slices.Values(strings.Fields(string(apis)))))) != 4 {
		t.Errorf("not three different ports: %s", apis) // "apiAddress:" and three addresses
	}
	mu.Lock()
	defer mu.Unlock()
	if n := strings.Count(strings.Join(said, "\n"), "trying it on other ports"); n != 2 {
		t.Errorf("said so %d times, not 2: %q", n, said)
	}
	if strings.Contains(strings.Join(said, "\n"), "restarting it") {
		t.Errorf("restarted on the same ports: %q", said)
	}
}

// A session's folder stays while the session lasts, however little of it this app can see (on Linux its
// programs may be in a PID namespace of their own, as in a container, and no command line here names the
// folder): the session holds a lock on a file in it, and a clean-up takes a folder only once it has taken
// that lock. A folder whose session has gone is taken; on Linux and macOS one still being made, with no
// lock in it yet, is left.
func TestLeftoverFoldersGoOnlyOnceTheirLockIsFree(t *testing.T) {
	tmp := t.TempDir()
	for _, name := range []string{"TMPDIR", "TMP", "TEMP"} {
		t.Setenv(name, tmp)
	}
	live, lock := sessionFolder(t)
	defer lock.Close()
	gone, ended := sessionFolder(t)
	ended.Close()
	making, err := os.MkdirTemp("", "mouseparty-host-")
	if err != nil {
		t.Fatal(err)
	}
	h := &Host{Log: func(string) {}, HTTPPort: freePort()}
	h.killLeftovers()
	h.killLeftovers()
	if _, err := os.Stat(filepath.Join(live, mediamtxYML)); err != nil {
		t.Error("a live session's folder was taken:", err)
	}
	if _, err := os.Stat(gone); !os.IsNotExist(err) {
		t.Error("a folder whose session had gone is still there:", err)
	}
	if _, err := os.Stat(making); err != nil && runtime.GOOS != "windows" {
		t.Error("a folder still being made was taken:", err)
	}
	lock.Close()
	h.killLeftovers()
	if _, err := os.Stat(live); !os.IsNotExist(err) {
		t.Error("a folder is still there after its session let go of it:", err)
	}
}

// A live session's programs are left alone by another app's clean-up, however often Play is pressed
// there: its watchdog, the tool under the watchdog, and a cloudflared of the user's own that tunnels to
// the same port. What a session left once its watchdog had gone is stopped (on Linux with this test as
// the orphans' subreaper, as a desktop's systemd --user is), and its folder is taken once its lock is free.
func TestLeftoversAreOnlyWhatASessionLeftBehind(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("a job ends each of Windows's programs with the app: only folders are left (TestLeftoverFoldersGoOnlyOnceTheirLockIsFree)")
	}
	tempHome(t)
	t.Setenv("TMPDIR", t.TempDir())
	var live *Host
	t.Cleanup(func() {
		if live != nil {
			live.Stop()
		}
	})
	asSubreaper(t)
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	bin := t.TempDir()
	standIn := func(name string) string {
		p := filepath.Join(bin, name)
		if err := os.Symlink(exe, p); err != nil {
			t.Fatal(err)
		}
		return p
	}
	mediamtx, cloudflared := standIn("mediamtx"), standIn("cloudflared")
	var mu sync.Mutex
	var said, liveSaid []string
	sweeper := &Host{Log: func(s string) { mu.Lock(); said = append(said, s); mu.Unlock() }, HTTPPort: freePort()}
	tunnel := []string{probeArg, "wait", "tunnel", "--no-autoupdate", "--url", tunnelOrigin(sweeper.HTTPPort)}

	dir, lock := sessionFolder(t)
	defer lock.Close()
	held, keep, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer keep.Close()
	session := watched(mediamtx, []string{probeArg, "wait", filepath.Join(dir, mediamtxYML)})
	session.Stdin = held
	sessionGone := startWaiting(t, session)
	held.Close()
	own := exec.Command(cloudflared, tunnel...)
	startGroup(own)
	ownGone := startWaiting(t, own)

	if findTool("mediamtx") != "" {
		live = NewHost(func(s string) { mu.Lock(); liveSaid = append(liveSaid, s); mu.Unlock() }, findTool("mediamtx"), "", standby)
		live.HTTPPort, live.ICEPort, live.MapPorts, live.CleanLeftovers = freePort(), freeICEPort(), false, false
		if err := live.Start(); err != nil {
			t.Fatal(err)
		}
	}
	liveIsUp := func() {
		t.Helper()
		if live == nil {
			return
		}
		live.mu.Lock()
		tmp, api := live.tmp, live.ports["api"]
		live.mu.Unlock()
		if _, err := os.Stat(filepath.Join(tmp, mediamtxYML)); err != nil || !portOpen(api) {
			t.Errorf("a live session's MediaMTX or its folder was taken: %v %v", err, portOpen(api))
		}
		mu.Lock()
		defer mu.Unlock()
		if strings.Contains(strings.Join(liveSaid, "\n"), "MediaMTX stopped") {
			t.Errorf("a live session's MediaMTX was stopped: %q", liveSaid)
		}
	}

	sweeper.killLeftovers()
	sweeper.killLeftovers()
	if goneWithin(sessionGone, time.Second) || goneWithin(ownGone, 0) {
		mu.Lock()
		defer mu.Unlock()
		t.Fatalf("stopped a live session's program, or the user's own: %q", said)
	}
	if _, err := os.Stat(filepath.Join(dir, mediamtxYML)); err != nil {
		t.Fatal("a live session's folder was taken:", err)
	}
	liveIsUp()

	session.Process.Kill()
	session.Wait()
	left := exec.Command("/bin/sh", append([]string{"-c", `"$@" &`, "sh", cloudflared}, tunnel...)...)
	startGroup(left)
	leftGone := startWaiting(t, left)
	left.Wait()
	lock.Close()
	sweeper.killLeftovers()
	if !goneWithin(sessionGone, 10*time.Second) {
		t.Error("what a session left once its watchdog had gone is still running")
	}
	if !goneWithin(leftGone, 10*time.Second) {
		t.Error("a cloudflared left tunneling to the port is still running")
	}
	if goneWithin(ownGone, 0) {
		t.Error("stopped the user's own cloudflared")
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Error("the folder of a session that had gone is still there:", err)
	}
	liveIsUp()
}

func sessionFolder(t *testing.T) (string, *os.File) {
	t.Helper()
	dir, err := os.MkdirTemp("", "mouseparty-host-")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, mediamtxYML), []byte("logLevel: warn\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	lock, err := holdSession(dir)
	if err != nil {
		t.Fatal(err)
	}
	return dir, lock
}

func startWaiting(t *testing.T, cmd *exec.Cmd) <-chan struct{} {
	t.Helper()
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	cmd.Stdout = w
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	w.Close()
	up, gone := make(chan struct{}), make(chan struct{})
	go func() {
		lines := bufio.NewScanner(r)
		for waiting := false; lines.Scan(); {
			if !waiting && lines.Text() == "waiting" {
				waiting = true
				close(up)
			}
		}
		r.Close()
		close(gone)
	}()
	t.Cleanup(func() {
		if !goneWithin(gone, 0) {
			killGroup(cmd)
		}
		cmd.Wait()
	})
	select {
	case <-up:
	case <-gone:
		t.Fatal(cmd.Args, "stopped as it started")
	case <-time.After(20 * time.Second):
		t.Fatal(cmd.Args, "didn't start")
	}
	return gone
}

func goneWithin(gone <-chan struct{}, within time.Duration) bool {
	select {
	case <-gone:
		return true
	default:
	}
	select {
	case <-gone:
		return true
	case <-time.After(within):
		return false
	}
}
