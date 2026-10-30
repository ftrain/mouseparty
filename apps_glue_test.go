package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ftrain/openhouseparty/apps"
	"github.com/gorilla/websocket"
)

// Apps run over the chat sockets: opened by any viewer, several at once, fed by
// viewers, caught up on by latecomers, and closed by anyone
func TestAppsOverChat(t *testing.T) {
	h := &Host{}
	h.chat = &Chat{conns: map[*chatConn]bool{}}
	h.apps = newAppHost(h.chat, apps.Env{Movie: h})
	h.chat.hello = h.greeting
	h.chat.app, h.chat.appControl = h.apps.message, h.apps.control
	h.chat.joined, h.chat.left = h.apps.joined, h.apps.left
	srv := httptest.NewServer(http.HandlerFunc(h.chat.handle))
	defer srv.Close()
	defer h.apps.closeAll()
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
	// event: the next app event, skipping the views resent when someone takes a name
	event := func(ws *websocket.Conn) map[string]any {
		for {
			if m := next(ws, "app"); m["kind"] != "view" {
				return m
			}
		}
	}

	a := dial()
	if hello := next(a, "hello"); len(hello["apps"].([]any)) != 0 || hello["you"] == nil {
		t.Fatal(hello)
	}
	a.WriteJSON(map[string]any{"type": "join", "name": "Ann"})
	a.WriteJSON(map[string]any{"type": "app_open", "name": "graffiti"})
	m := next(a, "apps")
	graffiti := m["app"].(map[string]any)
	if m["op"] != "open" || graffiti["name"] != "graffiti" || graffiti["glass"] != true || graffiti["by"] != "Ann" {
		t.Fatal(m)
	}
	gid := graffiti["id"]
	a.WriteJSON(map[string]any{"type": "app_open", "name": "nonsense"})
	if h.apps.Open("nonsense", apps.Viewer{}) != nil {
		t.Fatal("opened an app that doesn't exist")
	}

	a.WriteJSON(map[string]any{"type": "app", "id": gid, "kind": "line", "c": 5, "w": 1, "p": [][]float64{{0.1, 0.1}, {2, 0.5}}})
	a.WriteJSON(map[string]any{"type": "app", "id": gid, "kind": "line", "c": 1, "w": 1, "p": [][]float64{{0.1, 0.1}}}) // one point: no line
	a.WriteJSON(map[string]any{"type": "app", "id": 99, "kind": "go", "x": 0.5, "y": 0.5})                              // no such app
	m = event(a)
	l := m["line"].(map[string]any)
	if m["id"] != gid || l["c"] != float64(5) || l["p"].([]any)[1].([]any)[0] != 1.0 { // clamped
		t.Fatal(m)
	}

	time.Sleep(1100 * time.Millisecond)                   // a page opens or closes one a second
	room := h.apps.Open("room", apps.Viewer{Name: "Bob"}) // a second app beside the first
	if m := next(a, "apps"); m["app"].(map[string]any)["name"] != "room" {
		t.Fatal(m)
	}

	b := dial() // a latecomer sees both, and what's been drawn
	open := next(b, "hello")["apps"].([]any)
	if len(open) != 2 || open[0].(map[string]any)["name"] != "graffiti" || open[1].(map[string]any)["name"] != "room" {
		t.Fatal(open)
	}
	if lines := open[0].(map[string]any)["view"].(map[string]any)["lines"].([]any); len(lines) != 1 {
		t.Fatal(open[0])
	}

	a.WriteJSON(map[string]any{"type": "app", "id": room.ID, "kind": "go", "x": 0.25, "y": 0.75})
	if m := event(b); m["kind"] != "avatar" || m["id"] != float64(room.ID) || m["avatar"].(map[string]any)["name"] != "Ann" {
		t.Fatal(m)
	}

	b.WriteJSON(map[string]any{"type": "app_close", "id": gid}) // anyone closes any
	if m := next(a, "apps"); m["op"] != "close" || m["id"] != gid {
		t.Fatal(m)
	}
	if ss := h.apps.sessions(); len(ss) != 1 || ss[0].Kind.Name != "room" {
		t.Fatal(ss)
	}
	a.Close()
	if m := event(b); m["kind"] != "gone" {
		t.Fatal(m)
	}
}
