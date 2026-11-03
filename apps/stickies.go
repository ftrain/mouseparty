package apps

// Stickies: notes stuck on what's playing. Each is signed with its writer's chat
// name, in a colour they choose as they go, and anchored where they wrote it: a
// moment of a movie or a song (seconds into it), or a page of a document. They're
// kept, by what they're on, and come up again whenever it plays: a note shows at
// its moment for a few seconds (stickyShow, the script's), or for as long as its
// page is up. There's no window: the notes are on the picture itself (Glass).
// Anyone writes them; only their writer moves, recolours or takes one off.

import (
	"encoding/json"
	"strings"
	"time"
)

const (
	stickyColors = 6     // the script's palette; a colour is its index
	stickyText   = 280   // a note's words at most
	stickiesMax  = 2000  // notes on one thing; then it's full
	stickyThings = 500   // things kept with notes on them
	stickyPages  = 1e5   // pages.go pagesMax
	stickyTime   = 864e3 // seconds: ten days of movie
)

// Playing is what's on, as apps see it (the host's Movie.Playing): Key names it
// from one session to the next (and says nothing of where its file is), Paged
// that it's a document whose notes go on pages, not moments
type Playing struct {
	Key   string `json:"key"`
	Title string `json:"title"`
	Paged bool   `json:"paged"`
}

// Sticky is one note
type Sticky struct {
	ID    int     `json:"id"`
	By    string  `json:"by"`
	Text  string  `json:"text"`
	Color int     `json:"c"`
	X     float64 `json:"x"` // where on the picture, 0-1 across and down
	Y     float64 `json:"y"`
	At    float64 `json:"at,omitempty"`   // seconds into a movie or a song
	Page  int     `json:"page,omitempty"` // or a document's page
	When  int64   `json:"when"`           // when it was written, epoch seconds
}

// stuck: the notes on one thing
type stuck struct {
	Title string   `json:"title"`
	Next  int      `json:"next"`
	Notes []Sticky `json:"notes"`
	Last  int64    `json:"last"` // when a note last changed, for keeping the newest things
}

type stickies struct {
	Base
	things map[string]*stuck
	now    Playing
}

func newStickies(r *Room) Activity {
	s := &stickies{things: map[string]*stuck{}}
	s.now = playing(r)
	return s
}

func playing(r *Room) Playing {
	if r.Movie == nil {
		return Playing{}
	}
	return r.Movie.Playing()
}

func (s *stickies) View(Viewer) any {
	notes := []Sticky{}
	if t := s.things[s.now.Key]; t != nil && s.now.Key != "" {
		notes = t.Notes
	}
	return map[string]any{"on": s.now.Key != "", "key": s.now.Key, "title": s.now.Title, "paged": s.now.Paged, "notes": notes}
}

// Tick: when what's playing changes, the notes on it come up
func (s *stickies) Tick(r *Room, _ time.Time) {
	if p := playing(r); p != s.now {
		s.now = p
		r.Changed()
	}
}

func (s *stickies) Message(r *Room, from Viewer, m Msg) {
	if from.Name == "" || s.now.Key == "" {
		return // notes are signed: write one by joining the chat
	}
	t := s.things[s.now.Key]
	switch m.Kind() {
	case "add":
		text := strings.TrimSpace(m.Str("text", stickyText))
		c, okc := m.Int("c", 0, stickyColors-1)
		x, okx := m.Num("x", 0, 1)
		y, oky := m.Num("y", 0, 1)
		if text == "" || !okc || !okx || !oky {
			return
		}
		n := Sticky{By: from.Name, Text: text, Color: c, X: x, Y: y, When: time.Now().Unix()}
		if s.now.Paged {
			page, ok := m.Int("page", 1, stickyPages)
			if !ok {
				return
			}
			n.Page = page
		} else {
			at, ok := m.Num("at", 0, stickyTime)
			if !ok {
				return
			}
			n.At = float64(int64(at*10)) / 10
		}
		if t == nil {
			t = &stuck{}
			s.things[s.now.Key] = t
			s.trim()
		}
		if len(t.Notes) >= stickiesMax {
			return
		}
		t.Next++
		n.ID = t.Next
		t.Title, t.Last = s.now.Title, time.Now().Unix()
		t.Notes = append(t.Notes, n)
		r.Changed()
	case "move", "color", "remove":
		id, ok := m.Int("sid", 1, 1<<30)
		if !ok || t == nil {
			return
		}
		for i := range t.Notes {
			n := &t.Notes[i]
			if n.ID != id || n.By != from.Name { // only its writer
				continue
			}
			switch m.Kind() {
			case "move":
				x, okx := m.Num("x", 0, 1)
				y, oky := m.Num("y", 0, 1)
				if !okx || !oky {
					return
				}
				n.X, n.Y = x, y
			case "color":
				c, okc := m.Int("c", 0, stickyColors-1)
				if !okc {
					return
				}
				n.Color = c
			case "remove":
				t.Notes = append(t.Notes[:i], t.Notes[i+1:]...)
			}
			t.Last = time.Now().Unix()
			r.Changed()
			return
		}
	}
}

// trim: the things with notes on them, the stickyThings most lately written on
func (s *stickies) trim() {
	for len(s.things) > stickyThings {
		oldest, at := "", int64(1<<62)
		for k, t := range s.things {
			if k != s.now.Key && t.Last < at {
				oldest, at = k, t.Last
			}
		}
		if oldest == "" {
			return
		}
		delete(s.things, oldest)
	}
}

// Save: every thing's notes, by its key
func (s *stickies) Save() any { return s.things }

func (s *stickies) Load(b []byte) error {
	things := map[string]*stuck{}
	if err := json.Unmarshal(b, &things); err != nil {
		return err
	}
	for k, t := range things {
		if t == nil || k == "" {
			delete(things, k)
		}
	}
	s.things = things
	return nil
}
