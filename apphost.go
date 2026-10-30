package main

// The app on viewers' pages (package apps), for this session: one at a time,
// over each viewer's chat socket. Viewers send {"type": "app", "app": <name>,
// ...}; the app's views and events go back as {"type": "app", ...}, and which
// app is up (with this viewer's view) as {"type": "apps"}.

import (
	"sync"
	"time"

	"github.com/ftrain/openhouseparty/apps"
)

type appHost struct {
	chat  *Chat
	movie apps.Movie
	mu    sync.Mutex
	now   *apps.Session
}

func (a *appHost) session() *apps.Session {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.now
}

func (a *appHost) send(to int, msg map[string]any) {
	if to == 0 {
		a.chat.sendAll(msg)
	} else {
		a.chat.sendTo(to, msg)
	}
}

// StartApp runs the app called name for d, in place of any other; false if there's no such app
func (h *Host) StartApp(name string, d time.Duration) bool {
	kind, ok := apps.Lookup(name)
	if !ok || h.apps == nil {
		return false
	}
	h.apps.mu.Lock()
	old := h.apps.now
	h.apps.now = nil
	h.apps.mu.Unlock()
	if old != nil {
		old.Stop()
	}
	s := apps.Start(kind, d, h.apps.send, h.apps.chat.viewers, h.apps.movie, h.AppsDir)
	h.apps.mu.Lock()
	h.apps.now = s
	h.apps.mu.Unlock()
	return true
}

func (h *Host) StopApp() {
	if h.apps == nil {
		return
	}
	h.apps.mu.Lock()
	old := h.apps.now
	h.apps.now = nil
	h.apps.mu.Unlock()
	if old != nil {
		old.Stop()
		h.broadcast(map[string]any{"type": "apps", "app": nil})
	}
}

// hello: the app up now and this viewer's view of it, for a page arriving
func (a *appHost) hello(v apps.Viewer) map[string]any {
	if s := a.session(); s != nil {
		return s.Hello(v)
	}
	return map[string]any{"type": "apps", "app": nil}
}

func (a *appHost) message(from apps.Viewer, m map[string]any) {
	if s := a.session(); s != nil {
		s.Message(from, m)
	}
}

func (a *appHost) joined(v apps.Viewer) {
	if s := a.session(); s != nil {
		s.Joined(v)
	}
}

func (a *appHost) left(v apps.Viewer) {
	if s := a.session(); s != nil {
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
