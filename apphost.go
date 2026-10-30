package main

// The apps on viewers' pages (package apps), for this session: any viewer opens
// one or closes one, and several run at once, each numbered. It all goes over
// the chat sockets: a page sends {"type": "app_open", "name"}, {"type":
// "app_close", "id"} and {"type": "app", "id", ...} for the app itself; the
// pages get {"type": "apps", "op": "open", "app": {..., "view"}} (each its own
// view), {"type": "apps", "op": "close", "id"}, and the app's views and events as
// {"type": "app", "id", ...}. Which are open, and how, is for each page to arrange.

import (
	"sort"
	"sync"
	"time"

	"github.com/ftrain/mouseparty/apps"
)

const appsMax = 8 // open at once: more is clutter, and every one ticks and sends

type appHost struct {
	chat   *Chat
	env    apps.Env
	mu     sync.Mutex
	open   map[int]*apps.Session
	lastID int
}

func newAppHost(chat *Chat, env apps.Env) *appHost {
	return &appHost{chat: chat, env: env, open: map[int]*apps.Session{}}
}

func (a *appHost) send(to int, msg map[string]any) {
	if to == 0 {
		a.chat.sendAll(msg)
	} else {
		a.chat.sendTo(to, msg)
	}
}

// sessions: the apps open, oldest first
func (a *appHost) sessions() []*apps.Session {
	a.mu.Lock()
	defer a.mu.Unlock()
	ss := make([]*apps.Session, 0, len(a.open))
	for _, s := range a.open {
		ss = append(ss, s)
	}
	sort.Slice(ss, func(i, j int) bool { return ss[i].ID < ss[j].ID })
	return ss
}

func (a *appHost) get(m map[string]any) *apps.Session {
	id, _ := m["id"].(float64)
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.open[int(id)]
}

// Open starts the app called name for everyone; by is who asked. Nil if there's
// no such app, or as many are open as there can be.
func (a *appHost) Open(name string, by apps.Viewer) *apps.Session {
	kind, ok := apps.Lookup(name)
	if !ok {
		return nil
	}
	a.mu.Lock()
	if len(a.open) >= appsMax {
		a.mu.Unlock()
		return nil
	}
	a.lastID++
	id := a.lastID
	a.mu.Unlock()
	s := apps.Start(kind, id, by.Name, a.send, a.chat.viewers, a.env)
	a.mu.Lock()
	a.open[id] = s
	a.mu.Unlock()
	for _, v := range a.chat.viewers() {
		a.chat.sendTo(v.ID, map[string]any{"type": "apps", "op": "open", "app": s.Info(v)})
	}
	if by.Name != "" {
		a.chat.say(map[string]any{"type": "system", "text": by.Name + " opened " + kind.Title})
	}
	return s
}

// Close stops app id for everyone; by is who asked ("" the host)
func (a *appHost) Close(id int, by string) {
	a.mu.Lock()
	s := a.open[id]
	delete(a.open, id)
	a.mu.Unlock()
	if s == nil {
		return
	}
	s.Stop()
	a.chat.sendAll(map[string]any{"type": "apps", "op": "close", "id": id})
	if by != "" {
		a.chat.say(map[string]any{"type": "system", "text": by + " closed " + s.Kind.Title})
	}
}

// closeAll: hosting is over
func (a *appHost) closeAll() {
	for _, s := range a.sessions() {
		a.mu.Lock()
		delete(a.open, s.ID)
		a.mu.Unlock()
		s.Stop()
	}
}

// control: a page opening or closing an app
func (a *appHost) control(from apps.Viewer, m map[string]any) {
	switch m["type"] {
	case "app_open":
		name, _ := m["name"].(string)
		a.Open(name, from)
	case "app_close":
		if s := a.get(m); s != nil {
			by := from.Name
			if by == "" {
				by = "Someone"
			}
			a.Close(s.ID, by)
		}
	}
}

// hello: every app open and this viewer's view of each, for a page arriving
func (a *appHost) hello(v apps.Viewer) []map[string]any {
	infos := []map[string]any{}
	for _, s := range a.sessions() {
		infos = append(infos, s.Info(v))
	}
	return infos
}

func (a *appHost) message(from apps.Viewer, m map[string]any) {
	if s := a.get(m); s != nil {
		s.Message(from, m)
	}
}

func (a *appHost) joined(v apps.Viewer) {
	for _, s := range a.sessions() {
		s.Joined(v)
	}
}

func (a *appHost) left(v apps.Viewer) {
	for _, s := range a.sessions() {
		s.Left(v)
	}
}

// ---------- the movie, for apps that play along (apps.Movie) ----------

// Lines: the subtitles viewers are offered for the movie playing, the default track's
func (h *Host) Lines() []apps.Line {
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.subs) == 0 {
		return nil
	}
	track := h.subs[0]
	for _, t := range h.subs {
		if t.Default {
			track = t
		}
	}
	lines := make([]apps.Line, 0, len(track.Cues))
	for _, c := range track.Cues {
		lines = append(lines, apps.Line{Start: c.Start, End: c.End, Text: c.Text})
	}
	return lines
}

// Position: seconds into the movie playing, as ffmpeg last said
func (h *Host) Position() (float64, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clock == nil {
		return 0, false
	}
	return h.clock.position + time.Since(h.clock.at).Seconds(), true
}
