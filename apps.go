package main

// Apps: something everyone does together for a while on the viewer page, over the
// video (drawing on it) or filling the screen (walking around a room). One runs
// at a time, for app_minutes, started from the Apps menu; the movie carries on
// underneath.
//
// Each is a Go type, an Activity (the rules, and what a latecomer needs to catch
// up), and a script, host_web/apps/<name>.js, that draws it. They talk over each
// viewer's chat socket: viewers send {"type": "app", "app": <name>, ...}, and the
// Activity's own messages go out as {"type": "app", ...}. No new port or server.

import (
	"sync"
	"time"
)

// An Activity is one app, running. The host calls it one call at a time, so it
// keeps no locks of its own.
type Activity interface {
	State() any                                         // everything a viewer arriving now needs
	Message(r *Audience, from Viewer, m map[string]any) // what a viewer sent; check it all, it's from anyone
	Left(r *Audience, who Viewer)                       // a viewer's socket closed
}

// Viewer is who sent a message: ID is their socket, Name "" until they join the chat
type Viewer struct {
	ID   int
	Name string
}

// Audience is what an Activity can do: talk to the viewers
type Audience struct {
	chat *Chat
}

// Send tells every viewer's app m
func (r *Audience) Send(m map[string]any) {
	m["type"] = "app"
	r.chat.sendAll(m)
}

// AppKind is an app TubeYap knows: its script is host_web/apps/<Name>.js
type AppKind struct {
	Name  string
	Title string // in the Apps menu and the viewers' chat header
	Cover bool   // fills the screen, rather than drawing over the video
	New   func() Activity
}

var appKinds = []AppKind{
	{"graffiti", "Graffiti", false, func() Activity { return &graffiti{} }},
	{"room", "Room", true, func() Activity { return &room{avatars: map[int]*avatar{}} }},
}

func appKind(name string) (AppKind, bool) {
	for _, k := range appKinds {
		if k.Name == name {
			return k, true
		}
	}
	return AppKind{}, false
}

type runningApp struct {
	kind AppKind
	act  Activity
	ends time.Time
}

// apps is the app running in one session, if any
type apps struct {
	mu       sync.Mutex
	audience *Audience
	now      *runningApp
}

// StartApp runs the app called name for d, in place of any other; false if there's no such app
func (h *Host) StartApp(name string, d time.Duration) bool {
	kind, ok := appKind(name)
	if !ok || h.apps == nil {
		return false
	}
	h.apps.mu.Lock()
	h.apps.now = &runningApp{kind, kind.New(), time.Now().Add(d)}
	msg := h.apps.json()
	h.apps.mu.Unlock()
	h.broadcast(msg)
	return true
}

func (h *Host) StopApp() {
	if h.apps == nil {
		return
	}
	h.apps.mu.Lock()
	had := h.apps.now != nil
	h.apps.now = nil
	msg := h.apps.json()
	h.apps.mu.Unlock()
	if had {
		h.broadcast(msg)
	}
}

// json: which app is up and its whole state, for a viewer to start drawing it
// (the caller holds mu)
func (a *apps) json() map[string]any {
	if a.now == nil {
		return map[string]any{"type": "apps", "app": nil}
	}
	k := a.now.kind
	return map[string]any{"type": "apps", "app": map[string]any{"name": k.Name, "title": k.Title, "cover": k.Cover,
		"left": time.Until(a.now.ends).Seconds()}, "state": a.now.act.State()}
}

func (a *apps) hello() map[string]any {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.json()
}

// message hands a viewer's message to the app it was meant for (not one since stopped)
func (a *apps) message(from Viewer, m map[string]any) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.now != nil && m["app"] == a.now.kind.Name {
		a.now.act.Message(a.audience, from, m)
	}
}

func (a *apps) left(who Viewer) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.now != nil {
		a.now.act.Left(a.audience, who)
	}
}

// ---------- reading what viewers send ----------

// number: m[key] as a number within [lo, hi]; false if it isn't one
func number(m map[string]any, key string, lo, hi float64) (float64, bool) {
	f, ok := m[key].(float64)
	if !ok || f != f {
		return 0, false
	}
	return min(max(f, lo), hi), true
}
