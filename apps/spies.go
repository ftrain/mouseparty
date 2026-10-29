package apps

// Spies: two teams, red and blue, and 25 words. Each team's spymaster knows which
// words are their team's agents and gives one-word clues with a number; their
// team picks words. Find all your agents first; pick the assassin and you lose.

import (
	"slices"
	"time"
)

const (
	spiesClue  = 90 * time.Second
	spiesGuess = 120 * time.Second
	spiesOver  = 20 * time.Second
)

type spyCard struct {
	Word     string `json:"word"`
	Color    string `json:"color"` // red, blue, neutral, assassin
	Revealed bool   `json:"revealed"`
}

type spies struct {
	Base
	lobby   *Lobby
	phase   string // lobby, clue, guess, over
	cards   []spyCard
	team    map[int]string // player id -> red or blue
	master  map[string]int // team -> its spymaster
	turn    string
	clue    string
	number  int
	guesses int // left this turn
	winner  string
	why     string
	timer   Timer
}

func newSpies(*Room) Activity {
	return &spies{lobby: NewLobby(4, 12, 20*time.Second), phase: "lobby"}
}

func other(team string) string {
	if team == "red" {
		return "blue"
	}
	return "red"
}

func (s *spies) start(r *Room) {
	words := slices.Clone(Common)
	Shuffle(r, words)
	colors := []string{"assassin"}
	for i := range 9 {
		colors = append(colors, "red")
		if i < 8 {
			colors = append(colors, "blue")
		}
	}
	for len(colors) < 25 {
		colors = append(colors, "neutral")
	}
	Shuffle(r, colors)
	s.cards = nil
	for i := range 25 {
		s.cards = append(s.cards, spyCard{Word: words[i], Color: colors[i]})
	}
	ids := s.lobby.Players.IDs()
	Shuffle(r, ids)
	s.team, s.master = map[int]string{}, map[string]int{}
	for i, id := range ids {
		t := []string{"red", "blue"}[i%2]
		s.team[id] = t
		if s.master[t] == 0 {
			s.master[t] = id
		}
	}
	s.winner, s.why = "", ""
	s.startTurn("red") // red has nine to find, so goes first
}

func (s *spies) startTurn(team string) {
	s.turn, s.phase, s.clue, s.number, s.guesses = team, "clue", "", 0, 0
	s.timer.Set(spiesClue)
}

func (s *spies) left(team string) int {
	n := 0
	for _, c := range s.cards {
		if c.Color == team && !c.Revealed {
			n++
		}
	}
	return n
}

func (s *spies) over(winner, why string) {
	s.phase, s.winner, s.why = "over", winner, why
	s.timer.Set(spiesOver)
}

func (s *spies) Message(r *Room, from Viewer, m Msg) {
	if s.phase == "lobby" {
		if s.lobby.Message(r, from, m) {
			s.start(r)
		}
		r.Changed()
		return
	}
	team := s.team[from.ID]
	isMaster := team != "" && s.master[team] == from.ID
	switch {
	case m.Kind() == "clue" && s.phase == "clue" && team == s.turn && isMaster:
		clue := Normal(m.Str("word", 30))
		n, ok := m.Int("n", 0, 9)
		if clue == "" || !ok {
			return
		}
		for _, c := range s.cards {
			if !c.Revealed && Normal(c.Word) == clue {
				r.To(from.ID, Msg{"kind": "nope", "why": "That word is on the board."})
				return
			}
		}
		s.clue, s.number, s.guesses, s.phase = clue, n, n+1, "guess"
		if n == 0 {
			s.guesses = 25
		}
		s.timer.Set(spiesGuess)
	case m.Kind() == "pick" && s.phase == "guess" && team == s.turn && !isMaster:
		i, ok := m.Int("i", 0, len(s.cards)-1)
		if !ok || s.cards[i].Revealed {
			return
		}
		c := &s.cards[i]
		c.Revealed = true
		switch {
		case c.Color == "assassin":
			s.over(other(team), from.Name+" found the assassin.")
		case s.left("red") == 0:
			s.over("red", "Red found all their agents.")
		case s.left("blue") == 0:
			s.over("blue", "Blue found all their agents.")
		case c.Color != team:
			s.startTurn(other(team))
		default:
			if s.guesses--; s.guesses <= 0 {
				s.startTurn(other(team))
			}
		}
	case m.Kind() == "pass" && s.phase == "guess" && team == s.turn && !isMaster:
		s.startTurn(other(team))
	default:
		return
	}
	r.Changed()
}

func (s *spies) Tick(r *Room, now time.Time) {
	switch {
	case s.phase == "lobby":
		if s.lobby.Tick(now) {
			s.start(r)
			r.Changed()
		}
	case s.phase == "over" && s.timer.Done(now):
		s.phase = "lobby"
		s.lobby.Reopen()
		r.Changed()
	case s.phase != "over" && s.timer.Done(now): // out of time: the other team's go
		s.startTurn(other(s.turn))
		r.Changed()
	}
}

func (s *spies) Left(r *Room, v Viewer) {
	if !s.lobby.Players.Has(v.ID) {
		return
	}
	s.lobby.Left(v)
	if t := s.team[v.ID]; t != "" && s.phase != "lobby" && s.phase != "over" {
		delete(s.team, v.ID)
		if s.master[t] == v.ID { // someone else on the team takes over
			s.master[t] = 0
			for id, tt := range s.team {
				if tt == t {
					s.master[t] = id
					break
				}
			}
		}
		if s.master[t] == 0 {
			s.over(other(t), "Everyone on "+t+" left.")
		}
	}
	r.Changed()
}

func (s *spies) View(v Viewer) any {
	view := map[string]any{"phase": s.phase, "lobby": s.lobby.View(v)}
	if s.phase == "lobby" {
		return view
	}
	team := s.team[v.ID]
	isMaster := team != "" && s.master[team] == v.ID
	cards := []spyCard{}
	for _, c := range s.cards {
		if !c.Revealed && !isMaster && s.phase != "over" {
			c.Color = ""
		}
		cards = append(cards, c)
	}
	teams := map[string][]string{"red": {}, "blue": {}}
	for _, p := range s.lobby.Players.List() {
		if t := s.team[p.ID]; t != "" {
			name := p.Name
			if s.master[t] == p.ID {
				name += " (spymaster)"
			}
			teams[t] = append(teams[t], name)
		}
	}
	view["cards"], view["team"], view["master"], view["turn"] = cards, team, isMaster, s.turn
	view["clue"], view["number"], view["guesses"], view["left"] = s.clue, s.number, s.guesses, s.timer.Left()
	view["teams"], view["winner"], view["why"] = teams, s.winner, s.why
	view["remaining"] = map[string]int{"red": s.left("red"), "blue": s.left("blue")}
	return view
}
