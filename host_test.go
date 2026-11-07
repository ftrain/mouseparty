package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
	t.Setenv("HOME", t.TempDir())
	retries, settle := tunnelRetries, cfSettle
	tunnelRetries, cfSettle = []time.Duration{0, 50 * time.Millisecond, 50 * time.Millisecond}, 0
	defer func() { tunnelRetries, cfSettle = retries, settle }()

	dir := t.TempDir()
	fake := filepath.Join(dir, "cloudflared") // says no twice, then gives a link and stays up
	os.WriteFile(fake, []byte(`#!/bin/sh
n=$(cat "`+dir+`/tries" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "`+dir+`/tries"
echo "INF Requesting new quick Tunnel on trycloudflare.com..."
if [ $n -lt 3 ]; then echo "quick tunnel provisioning failed with status 429: [10000] Tunnelstore request failed"; exit 1; fi
echo "INF |  https://made-up-words-here.trycloudflare.com  |"
echo "INF Registered tunnel connection connIndex=0 protocol=quic"
exec sleep 60
`), 0o755)

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
	t.Setenv("HOME", t.TempDir())
	dir := t.TempDir()
	stand := filepath.Join(dir, "mediamtx")
	script := fmt.Sprintf("#!/bin/sh\nn=$(cat %[1]s/runs 2>/dev/null || echo 0); echo $((n+1)) > %[1]s/runs; grep apiAddress \"$1\" >> %[1]s/apis\n"+
		"[ \"$n\" -lt 2 ] && { echo 'ERR listen tcp 127.0.0.1:1: bind: address already in use'; exit 1; }\nexec %[2]q \"$@\"\n", dir, real)
	if err := os.WriteFile(stand, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
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
