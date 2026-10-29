package main

// Chat: the viewers' chat over one websocket each, kept only in memory. The same
// socket carries what the page shows beside the movie (session.go).

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/ftrain/tubeyap/apps"
	"github.com/gorilla/websocket"
)

const (
	history = 200 // chat lines kept for people who join late
	nameMax = 30
	textMax = 500
	appRate = 60 // app messages a second from one socket; more are dropped
)

// chatConn is one viewer's socket. Everything sent to it goes through out, in
// order, written by its own goroutine, so a slow viewer holds nobody else up.
type chatConn struct {
	ws   *websocket.Conn
	out  chan []byte
	id   int // this socket, for apps (a viewer with two tabs is two)
	name string
}

func (c *chatConn) send(b []byte) {
	select {
	case c.out <- b:
	default: // hopelessly behind: it'll catch up from /status when it reconnects
		c.ws.Close()
	}
}

// write sends what's queued, and a ping every 20 seconds to keep it alive
func (c *chatConn) write(done <-chan struct{}) {
	t := time.NewTicker(20 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-done:
			return
		case b := <-c.out:
			c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if c.ws.WriteMessage(websocket.TextMessage, b) != nil {
				c.ws.Close()
				return
			}
		case <-t.C:
			c.ws.WriteControl(websocket.PingMessage, nil, time.Now().Add(10*time.Second))
		}
	}
}

// Chat is the in-memory chat for one session: who is here, and the last few hundred lines
type Chat struct {
	hello   func(v apps.Viewer) map[string]any       // more for the greeting: subtitles, the movie clock, the guide, a PDF, an app
	app     func(from apps.Viewer, m map[string]any) // a message for the app running (apphost.go)
	joined  func(v apps.Viewer)                      // a socket opened, or its viewer took a name
	left    func(v apps.Viewer)                      // a socket closed
	mu      sync.Mutex
	conns   map[*chatConn]bool
	history []map[string]any
	lastID  int
}

func (c *Chat) names() []string {
	seen := map[string]bool{}
	for conn := range c.conns {
		if conn.name != "" {
			seen[conn.name] = true
		}
	}
	names := []string{}
	for n := range seen {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}

func (c *Chat) sendAll(msg any) {
	b, _ := json.Marshal(msg)
	c.mu.Lock()
	conns := make([]*chatConn, 0, len(c.conns))
	for conn := range c.conns {
		conns = append(conns, conn)
	}
	c.mu.Unlock()
	for _, conn := range conns {
		conn.send(b)
	}
}

// sendTo sends msg to one socket
func (c *Chat) sendTo(id int, msg any) {
	b, _ := json.Marshal(msg)
	c.mu.Lock()
	var to *chatConn
	for conn := range c.conns {
		if conn.id == id {
			to = conn
		}
	}
	c.mu.Unlock()
	if to != nil {
		to.send(b)
	}
}

// viewers: every socket open now, and its name
func (c *Chat) viewers() []apps.Viewer {
	c.mu.Lock()
	defer c.mu.Unlock()
	vs := make([]apps.Viewer, 0, len(c.conns))
	for conn := range c.conns {
		vs = append(vs, apps.Viewer{ID: conn.id, Name: conn.name})
	}
	sort.Slice(vs, func(i, j int) bool { return vs[i].ID < vs[j].ID })
	return vs
}

func (c *Chat) say(msg map[string]any) {
	msg["at"] = float64(time.Now().UnixMicro()) / 1e6
	c.mu.Lock()
	c.history = append(c.history, msg)
	if len(c.history) > history {
		c.history = c.history[len(c.history)-history:]
	}
	c.mu.Unlock()
	c.sendAll(msg)
}

func (c *Chat) online() {
	c.mu.Lock()
	names := c.names()
	c.mu.Unlock()
	c.sendAll(map[string]any{"type": "online", "online": names})
}

var upgrader = websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

func (c *Chat) handle(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	conn := &chatConn{ws: ws, out: make(chan []byte, 256)}
	c.mu.Lock()
	c.lastID++
	conn.id = c.lastID
	c.conns[conn] = true
	hello := map[string]any{"type": "hello", "history": append([]map[string]any{}, c.history...), "online": c.names(),
		"you": conn.id}
	c.mu.Unlock()
	for k, v := range c.hello(apps.Viewer{ID: conn.id}) {
		hello[k] = v
	}
	b, _ := json.Marshal(hello)
	conn.send(b)
	done := make(chan struct{})
	go conn.write(done)
	if c.joined != nil {
		c.joined(apps.Viewer{ID: conn.id})
	}

	ws.SetReadLimit(64 * 1024)
	ws.SetReadDeadline(time.Now().Add(45 * time.Second))
	ws.SetPongHandler(func(string) error { return ws.SetReadDeadline(time.Now().Add(45 * time.Second)) })
	defer func() {
		close(done)
		c.mu.Lock()
		delete(c.conns, conn)
		name := conn.name
		still := false
		for other := range c.conns {
			still = still || other.name == name
		}
		c.mu.Unlock()
		ws.Close()
		if c.left != nil {
			c.left(apps.Viewer{ID: conn.id, Name: name})
		}
		if name != "" && !still {
			c.say(map[string]any{"type": "system", "text": name + " left"})
			c.online()
		}
	}()

	var last time.Time
	appWindow, appCount := time.Now(), 0
	for {
		kind, data, err := ws.ReadMessage()
		if err != nil {
			return
		}
		ws.SetReadDeadline(time.Now().Add(45 * time.Second))
		if kind != websocket.TextMessage {
			continue
		}
		var m map[string]any
		if json.Unmarshal(data, &m) != nil {
			continue
		}
		switch m["type"] {
		case "join":
			name := truncate(strings.TrimSpace(fmt.Sprint(valueOr(m["name"], ""))), nameMax)
			if name == "" {
				continue
			}
			c.mu.Lock()
			old := conn.name
			conn.name = name
			c.mu.Unlock()
			if old != name && c.joined != nil {
				c.joined(apps.Viewer{ID: conn.id, Name: name})
			}
			if old != name {
				text := name + " joined"
				if old != "" {
					text = old + " is now " + name
				}
				c.say(map[string]any{"type": "system", "text": text})
				c.online()
			}
		case "say":
			c.mu.Lock()
			name := conn.name
			c.mu.Unlock()
			text := truncate(strings.TrimSpace(fmt.Sprint(valueOr(m["text"], ""))), textMax)
			if name != "" && text != "" && time.Since(last) > 300*time.Millisecond { // a little flood control
				last = time.Now()
				c.say(map[string]any{"type": "msg", "name": name, "text": text})
			}
		case "app":
			if time.Since(appWindow) > time.Second {
				appWindow, appCount = time.Now(), 0
			}
			if appCount++; appCount <= appRate && c.app != nil {
				c.mu.Lock()
				name := conn.name
				c.mu.Unlock()
				c.app(apps.Viewer{ID: conn.id, Name: name}, m)
			}
		}
	}
}

func (c *Chat) closeAll() {
	c.mu.Lock()
	conns := make([]*chatConn, 0, len(c.conns))
	for conn := range c.conns {
		conns = append(conns, conn)
	}
	c.mu.Unlock()
	for _, conn := range conns {
		conn.ws.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(1001, "host left"),
			time.Now().Add(2*time.Second))
		conn.ws.Close()
	}
}

func valueOr(v, or any) any {
	if v == nil {
		return or
	}
	return v
}

func truncate(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}
