package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ftrain/mouseparty/apps"
	"github.com/gorilla/websocket"
)

// As many watch as the host lets in (max_viewers), and one more is told the party is
// full, by the page and by the socket; when someone leaves there's room again.
func TestOneMoreThanMayWatchIsToldItsFull(t *testing.T) {
	h := &Host{MaxViewers: 2, key: "k"}
	h.session(nil, nil)
	h.chat.hello = func(apps.Viewer) map[string]any { return map[string]any{} }
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{key}/ws", func(w http.ResponseWriter, r *http.Request) { h.chat.handle(w, r) })
	srv := httptest.NewServer(mux)
	defer srv.Close()
	defer h.endSession()
	join := func() (*websocket.Conn, string) {
		t.Helper()
		ws, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http")+"/k/ws", nil)
		if err != nil {
			t.Fatal(err)
		}
		ws.SetReadDeadline(time.Now().Add(5 * time.Second))
		_, b, err := ws.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		return ws, string(b)
	}
	first, said := join()
	if !strings.Contains(said, `"hello"`) {
		t.Fatal("the first:", said)
	}
	second, _ := join()
	defer second.Close()
	if !h.chat.full() {
		t.Fatal("two of two, and not full")
	}
	third, said := join()
	if said != `{"type":"full"}` {
		t.Fatal("the third of two was let in:", said)
	}
	if _, _, err := third.ReadMessage(); err == nil {
		t.Fatal("the third's socket was kept open")
	}
	first.Close()
	for end := time.Now().Add(5 * time.Second); h.chat.full(); time.Sleep(20 * time.Millisecond) {
		if time.Now().After(end) {
			t.Fatal("someone left, and it's still full")
		}
	}
	again, said := join()
	defer again.Close()
	if !strings.Contains(said, `"hello"`) {
		t.Fatal("room again, and turned away:", said)
	}
}
