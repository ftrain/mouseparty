// Package apps is what everyone does together on the viewer page for a while:
// games, drawing, polls. One runs at a time, over the video or filling the screen.
//
// An app is an Activity (the rules, on the host's Mac) and a script,
// host_web/apps/<name>.js, that draws it. The Activity keeps all the state and
// decides everything; viewers only send what they did. It says what each viewer
// sees with View (so hands, roles and secret words stay private), and the
// Session sends every viewer their view again whenever the Activity calls
// Room.Changed. Things that happen too often for that (lines being drawn) go out
// as events with Room.All.
//
// The Session calls an Activity one call at a time, so it needs no locks. The
// pieces most games need (a lobby, players and scores, turns, votes, timers,
// the word list) are in lib.go and words.go.
//
// An app that keeps something past the session (the wall's graffiti, the last
// poll) is also a Keeper: the Session saves it to <dir>/<name>.json a moment
// after viewers change it, and when it stops, and loads it when it starts.
package apps

import (
	"encoding/json"
	"math/rand/v2"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Viewer is a viewer's page: ID is its socket (a viewer with two tabs is two),
// Name its chat name, "" until they join the chat
type Viewer struct {
	ID   int
	Name string
}

// Activity is one app, running
type Activity interface {
	View(v Viewer) any                   // what this viewer sees now, for the script to draw
	Message(r *Room, from Viewer, m Msg) // what a viewer did; check all of it, it's from anyone
	Tick(r *Room, now time.Time)         // four times a second: timers
	Joined(r *Room, v Viewer)            // a page arrived, or its viewer took a name
	Left(r *Room, v Viewer)              // a page closed
}

// Keeper is an Activity that keeps something from one session to the next.
// Nothing tied to a Viewer's ID: those are new every session.
type Keeper interface {
	Save() any           // what to keep, for encoding/json
	Load(b []byte) error // what Save kept, last time
}

// keepEvery: how often, at most, a Keeper is written while viewers change it
const keepEvery = 2 * time.Second

// Base is an Activity's do-nothing Tick, Joined and Left, for embedding
type Base struct{}

func (Base) Tick(*Room, time.Time) {}
func (Base) Joined(*Room, Viewer)  {}
func (Base) Left(*Room, Viewer)    {}

// Kind is an app Open House Party offers
type Kind struct {
	Name  string // its script is host_web/apps/<Name>.js
	Title string
	Icon  string // a Lucide icon's name, for the Mac's app picker
	Cover bool   // fills the screen, rather than sitting over the video
	New   func(r *Room) Activity
}

// Kinds: every app, in the order the picker shows them
var Kinds = []Kind{
	{"graffiti", "Graffiti", "spray-can", false, func(*Room) Activity { return &graffiti{} }},
	{"room", "Room", "door-open", true, func(*Room) Activity { return &room{avatars: map[int]*avatar{}} }},
	{"bingo", "Bingo", "grid-3x3", false, newBingo},
	{"wordgrid", "Word Grid", "dices", true, newWordGrid},
	{"tiles", "Tiles", "spell-check", true, newTiles},
	{"anagram", "Anagrams", "shuffle", false, newAnagram},
	{"sketch", "Sketch", "pencil-line", true, newSketch},
	{"blanks", "Blanks", "text-cursor-input", true, newBlanks},
	{"spies", "Spies", "venetian-mask", true, newSpies},
	{"werewolf", "Werewolf", "moon-star", true, newWerewolf},
	{"poll", "Polls", "chart-column", false, newPoll},
}

func Lookup(name string) (Kind, bool) {
	for _, k := range Kinds {
		if k.Name == name {
			return k, true
		}
	}
	return Kind{}, false
}

// Movie is what's playing, for apps that play along with it (Bingo)
type Movie interface {
	Lines() []Line             // its subtitles, if viewers are offered any
	Position() (float64, bool) // seconds into it; false when no movie is playing
}

type Line struct {
	Start, End float64
	Text       string
}

// Room is what an Activity can do: talk to the viewers, and know about them
type Room struct {
	Movie Movie
	Rand  *rand.Rand
	Ends  time.Time // when the app stops

	send    func(to int, msg map[string]any) // to 0: every page
	viewers func() []Viewer
	changed bool
}

// All sends every page an event; the script gets it in message(m)
func (r *Room) All(m Msg) {
	m["type"] = "app"
	r.send(0, m)
}

// To sends one page an event
func (r *Room) To(id int, m Msg) {
	m["type"] = "app"
	r.send(id, m)
}

// Changed: every page gets its view again once this call is over
func (r *Room) Changed() { r.changed = true }

// Viewers: every page open now
func (r *Room) Viewers() []Viewer { return r.viewers() }

// Session runs one app for a session's viewers, from Start to Stop
type Session struct {
	Kind  Kind
	mu    sync.Mutex
	act   Activity
	room  *Room
	stop  chan struct{}
	keep  string    // a Keeper's file; "" keeps nothing
	dirty bool      // changed since it was last written
	kept  time.Time // when it was
}

// Start runs kind for d. send delivers a message to one page (to > 0) or all
// (0); viewers lists the pages open. It sends each page the app and its view.
// A Keeper is kept in dir ("" for nowhere).
func Start(kind Kind, d time.Duration, send func(to int, msg map[string]any), viewers func() []Viewer, movie Movie, dir string) *Session {
	r := &Room{Movie: movie, Rand: rand.New(rand.NewPCG(rand.Uint64(), rand.Uint64())), Ends: time.Now().Add(d),
		send: send, viewers: viewers}
	s := &Session{Kind: kind, room: r, stop: make(chan struct{})}
	s.mu.Lock()
	s.act = kind.New(r)
	if k, ok := s.act.(Keeper); ok && dir != "" {
		s.keep = filepath.Join(dir, kind.Name+".json")
		if b, err := os.ReadFile(s.keep); err == nil {
			k.Load(b) // a file that won't read: start fresh, and write over it
		}
	}
	s.mu.Unlock()
	for _, v := range viewers() {
		send(v.ID, s.Hello(v))
	}
	go s.tick()
	return s
}

// Hello: the app and this viewer's view, for a page arriving (or the app starting)
func (s *Session) Hello(v Viewer) map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := s.Kind
	return map[string]any{"type": "apps", "app": map[string]any{"name": k.Name, "title": k.Title, "cover": k.Cover,
		"left": time.Until(s.room.Ends).Seconds()}, "view": s.act.View(v)}
}

// Message hands a viewer's message to the app, if it's for this one (not one since stopped)
func (s *Session) Message(from Viewer, m map[string]any) {
	if m["app"] != s.Kind.Name {
		return
	}
	s.call(func(r *Room) {
		s.act.Message(r, from, m)
		s.dirty = true // events (strokes) change it without Changed
	})
}

// Joined: a page arrived or its viewer took a name; their view may differ now (they can play)
func (s *Session) Joined(v Viewer) {
	s.call(func(r *Room) {
		s.act.Joined(r, v)
		r.Changed()
	})
}
func (s *Session) Left(v Viewer) { s.call(func(r *Room) { s.act.Left(r, v) }) }

// Stop ends the app; the caller tells the pages
func (s *Session) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	select {
	case <-s.stop:
	default:
		close(s.stop)
		s.save()
	}
}

// save writes a Keeper, if it changed (with s.mu held)
func (s *Session) save() {
	k, ok := s.act.(Keeper)
	if !ok || s.keep == "" || !s.dirty {
		return
	}
	s.dirty, s.kept = false, time.Now()
	b, err := json.Marshal(k.Save())
	if err != nil || os.MkdirAll(filepath.Dir(s.keep), 0o700) != nil {
		return
	}
	tmp := s.keep + ".tmp" // all of it or none: quitting mid-write leaves the last one
	if os.WriteFile(tmp, b, 0o600) == nil {
		os.Rename(tmp, s.keep)
	}
}

func (s *Session) tick() {
	t := time.NewTicker(250 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-s.stop:
			return
		case now := <-t.C:
			s.call(func(r *Room) { s.act.Tick(r, now) })
		}
	}
}

// call runs one call into the app, then sends the views if it changed them
func (s *Session) call(fn func(r *Room)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	select {
	case <-s.stop:
		return
	default:
	}
	fn(s.room)
	if s.room.changed {
		s.room.changed, s.dirty = false, true
		for _, v := range s.room.viewers() {
			s.room.send(v.ID, map[string]any{"type": "app", "kind": "view", "view": s.act.View(v)})
		}
	}
	if s.dirty && time.Since(s.kept) >= keepEvery {
		s.save()
	}
}

// ---------- reading what viewers send ----------

// Msg is a message from a viewer's page, as JSON decoded it
type Msg map[string]any

func (m Msg) Kind() string { s, _ := m["kind"].(string); return s }

// Str: m[key] as text, trimmed and cut to max characters
func (m Msg) Str(key string, max int) string {
	s, _ := m[key].(string)
	return cut(s, max)
}

// Num: m[key] as a number within [lo, hi]; false if it isn't one
func (m Msg) Num(key string, lo, hi float64) (float64, bool) {
	f, ok := m[key].(float64)
	if !ok || f != f {
		return 0, false
	}
	return min(max(f, lo), hi), true
}

// Int: m[key] as a whole number within [lo, hi]; false if it isn't one or is outside
func (m Msg) Int(key string, lo, hi int) (int, bool) {
	f, ok := m[key].(float64)
	if !ok || f != float64(int(f)) || int(f) < lo || int(f) > hi {
		return 0, false
	}
	return int(f), true
}
