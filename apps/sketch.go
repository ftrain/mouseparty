package apps

// Sketch: players take turns drawing an everyday word only they can see while
// everyone else guesses. Guess it sooner, score more; the artist scores for each
// person who gets it. Twice round, then back to the lobby.

import (
	"strings"
	"time"
)

const (
	sketchTurn   = 80 * time.Second
	sketchReveal = 5 * time.Second
	sketchOver   = 15 * time.Second
	sketchRounds = 2
	sketchFeed   = 8 // guesses shown
)

type sketch struct {
	Base
	lobby   *Lobby
	turns   Turns
	phase   string // "lobby", "draw", "reveal" or "over"
	word    string
	lines   []Stroke
	points  int
	guessed []int // in the order they got it
	feed    []string
	timer   Timer
}

func newSketch(*Room) Activity {
	return &sketch{lobby: NewLobby(2, 0, 15*time.Second), phase: "lobby"}
}

func (s *sketch) players() *Players { return &s.lobby.Players }

func (s *sketch) start(r *Room) {
	for _, p := range s.players().List() {
		p.Score = 0
	}
	s.turns.Set(s.players().IDs())
	s.turn(r)
}

// turn starts the current player's turn
func (s *sketch) turn(r *Room) {
	s.phase, s.word, s.lines, s.points, s.guessed, s.feed = "draw", Common[r.Rand.IntN(len(Common))], nil, 0, nil, nil
	s.turns.Timer.Set(sketchTurn)
	r.All(Msg{"kind": "clear"})
	r.Changed()
}

func (s *sketch) endTurn(r *Room) {
	s.phase = "reveal"
	s.timer.Set(sketchReveal)
	r.Changed()
}

func (s *sketch) Message(r *Room, from Viewer, m Msg) {
	if s.phase == "lobby" {
		if s.lobby.Message(r, from, m) {
			s.start(r)
		}
		r.Changed()
		return
	}
	drawer := s.turns.Current()
	switch m.Kind() {
	case "line":
		if l, ok := ReadStroke(m); ok && from.ID == drawer && s.phase == "draw" && s.points+len(l.Points) <= graffitiMaxTotal {
			s.lines = append(s.lines, l)
			s.points += len(l.Points)
			r.All(Msg{"kind": "line", "line": l})
		}
	case "clear":
		if from.ID == drawer && s.phase == "draw" {
			s.lines, s.points = nil, 0
			r.All(Msg{"kind": "clear"})
		}
	case "guess":
		p := s.players().Get(from.ID)
		if p == nil || from.ID == drawer || s.phase != "draw" || inList(s.guessed, from.ID) {
			return
		}
		g := m.Str("guess", 40)
		if Normal(g) == s.word {
			p.Score += max(1, 4-len(s.guessed))
			if d := s.players().Get(drawer); d != nil {
				d.Score++
			}
			s.guessed = append(s.guessed, from.ID)
			s.say("✓ " + p.Name + " got it")
			if len(s.guessed) >= s.players().Len()-1 {
				s.endTurn(r)
			}
		} else if g != "" {
			s.say(p.Name + ": " + g)
		}
		r.Changed()
	}
}

func (s *sketch) say(line string) {
	s.feed = append(s.feed, line)
	if len(s.feed) > sketchFeed {
		s.feed = s.feed[len(s.feed)-sketchFeed:]
	}
}

func inList(ids []int, id int) bool {
	for _, i := range ids {
		if i == id {
			return true
		}
	}
	return false
}

func (s *sketch) Tick(r *Room, now time.Time) {
	switch {
	case s.phase == "lobby":
		if s.lobby.Tick(now) {
			s.start(r)
		}
	case s.phase == "draw" && s.turns.Timer.Done(now):
		s.endTurn(r)
	case s.phase == "reveal" && s.timer.Done(now):
		if s.turns.Next(sketchTurn); s.turns.Rounds() >= sketchRounds || s.turns.Len() < 2 {
			s.phase = "over"
			s.timer.Set(sketchOver)
			r.Changed()
		} else {
			s.turn(r)
		}
	case s.phase == "over" && s.timer.Done(now):
		s.phase = "lobby"
		s.lobby.Reopen()
		r.Changed()
	}
}

func (s *sketch) Left(r *Room, v Viewer) {
	if !s.players().Has(v.ID) {
		return
	}
	s.lobby.Left(v)
	if s.phase != "lobby" && s.turns.Remove(v.ID) && s.phase == "draw" {
		s.endTurn(r) // the artist left
	}
	r.Changed()
}

func (s *sketch) View(v Viewer) any {
	view := map[string]any{"phase": s.phase, "lobby": s.lobby.View(v), "board": s.players().Board()}
	if s.phase == "lobby" {
		return view
	}
	drawer := s.turns.Current()
	hint := strings.Repeat("_ ", len(s.word))
	word := ""
	if v.ID == drawer || s.phase != "draw" || inList(s.guessed, v.ID) {
		word = s.word
	}
	lines := s.lines
	if lines == nil {
		lines = []Stroke{}
	}
	left := s.turns.Timer.Left()
	if s.phase != "draw" {
		left = s.timer.Left()
	}
	view["drawer"], view["drawing"], view["word"], view["hint"] = s.players().Name(drawer), v.ID == drawer, word, hint
	view["lines"], view["feed"], view["left"], view["playing"] = lines, s.feed, left, s.players().Has(v.ID)
	return view
}
