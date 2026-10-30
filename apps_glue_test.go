package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// Apps run over the chat sockets: started by the host, fed by viewers, caught up
// on by latecomers, and gone when stopped
func TestAppsOverChat(t *testing.T) {
	h := &Host{}
	h.chat = &Chat{conns: map[*chatConn]bool{}}
	h.apps = &appHost{chat: h.chat, movie: h}
	h.chat.hello = h.greeting
	h.chat.app, h.chat.joined, h.chat.left = h.apps.message, h.apps.joined, h.apps.left
	srv := httptest.NewServer(http.HandlerFunc(h.chat.handle))
	defer srv.Close()
	dial := func() *websocket.Conn {
		ws, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
		if err != nil {
			t.Fatal(err)
		}
		return ws
	}
	// next: the next message of that type, skipping the chat's own
	next := func(ws *websocket.Conn, kind string) map[string]any {
		for {
			ws.SetReadDeadline(time.Now().Add(3 * time.Second))
			var m map[string]any
			if err := ws.ReadJSON(&m); err != nil {
				t.Fatalf("waiting for %s: %v", kind, err)
			}
			if m["type"] == kind {
				return m
			}
		}
	}

	a := dial()
	if hello := next(a, "hello"); hello["apps"].(map[string]any)["app"] != nil || hello["you"] == nil {
		t.Fatal(hello)
	}
	if h.StartApp("nonsense", time.Minute) {
		t.Fatal("started an app that doesn't exist")
	}
	h.StartApp("graffiti", time.Minute)
	if m := next(a, "apps"); m["app"].(map[string]any)["name"] != "graffiti" {
		t.Fatal(m)
	}

	a.WriteJSON(map[string]any{"type": "app", "app": "graffiti", "kind": "line", "c": 5, "w": 1, "p": [][]float64{{0.1, 0.1}, {2, 0.5}}})
	a.WriteJSON(map[string]any{"type": "app", "app": "graffiti", "kind": "line", "c": 1, "w": 1, "p": [][]float64{{0.1, 0.1}}}) // one point: no line
	a.WriteJSON(map[string]any{"type": "app", "app": "room", "kind": "go", "x": 0.5, "y": 0.5})                                 // not the app running
	m := next(a, "app")
	l := m["line"].(map[string]any)
	if l["c"] != float64(5) || l["p"].([]any)[1].([]any)[0] != 1.0 { // clamped
		t.Fatal(m)
	}

	b := dial() // a latecomer sees what's been drawn
	hello := next(b, "hello")
	if lines := hello["apps"].(map[string]any)["view"].(map[string]any)["lines"].([]any); len(lines) != 1 {
		t.Fatal(hello["apps"])
	}

	h.StartApp("room", time.Minute)
	next(a, "apps")
	next(b, "apps")
	a.WriteJSON(map[string]any{"type": "app", "app": "room", "kind": "go", "x": 0.5, "y": 0.5}) // no name yet: ignored
	a.WriteJSON(map[string]any{"type": "join", "name": "Ann"})
	a.WriteJSON(map[string]any{"type": "app", "app": "room", "kind": "go", "x": 0.25, "y": 0.75})
	m = next(b, "app")
	if m["kind"] == "view" { // Ann taking a name sends everyone their view again
		m = next(b, "app")
	}
	if m["kind"] != "avatar" || m["avatar"].(map[string]any)["name"] != "Ann" || m["from"] == nil {
		t.Fatal(m)
	}
	a.Close()
	if m := next(b, "app"); m["kind"] != "gone" {
		t.Fatal(m)
	}

	h.StopApp()
	if m := next(b, "apps"); m["app"] != nil {
		t.Fatal(m)
	}
}
