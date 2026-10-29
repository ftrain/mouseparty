package apps

// The pieces games share: players and scores, a lobby to gather them, turns,
// votes and timers. Each is plain data an Activity keeps and drives from its
// Message and Tick; each has a View for the page (lib.js draws them).

import (
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

// ---------- timers ----------

// Timer is a deadline; the zero Timer isn't running
type Timer struct{ until time.Time }

func (t *Timer) Set(d time.Duration)     { t.until = time.Now().Add(d) }
func (t *Timer) Clear()                  { t.until = time.Time{} }
func (t *Timer) Running() bool           { return !t.until.IsZero() }
func (t *Timer) Done(now time.Time) bool { return t.Running() && !now.Before(t.until) }

// Left: seconds to go, for a view (the page counts down from there); 0 if not running
func (t *Timer) Left() float64 {
	if !t.Running() {
		return 0
	}
	return max(0, time.Until(t.until).Seconds())
}

// ---------- players ----------

// Player is someone playing: a viewer with a name, and their score
type Player struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Score int    `json:"score"`
}

// Players: who's playing, in the order they came
type Players struct{ list []*Player }

// Add puts v in (or renames them); nil if they have no name to play under
func (p *Players) Add(v Viewer) *Player {
	if v.Name == "" {
		return nil
	}
	if pl := p.Get(v.ID); pl != nil {
		pl.Name = v.Name
		return pl
	}
	pl := &Player{ID: v.ID, Name: v.Name}
	p.list = append(p.list, pl)
	return pl
}

func (p *Players) Get(id int) *Player {
	for _, pl := range p.list {
		if pl.ID == id {
			return pl
		}
	}
	return nil
}

func (p *Players) Remove(id int) bool {
	n := len(p.list)
	p.list = slices.DeleteFunc(p.list, func(pl *Player) bool { return pl.ID == id })
	return len(p.list) < n
}

func (p *Players) Has(id int) bool { return p.Get(id) != nil }
func (p *Players) List() []*Player { return p.list }
func (p *Players) Len() int        { return len(p.list) }
func (p *Players) IDs() []int {
	ids := []int{}
	for _, pl := range p.list {
		ids = append(ids, pl.ID)
	}
	return ids
}
func (p *Players) Name(id int) string {
	if pl := p.Get(id); pl != nil {
		return pl.Name
	}
	return "?"
}

// Board: the scores, best first, for a view
func (p *Players) Board() []Player {
	b := []Player{}
	for _, pl := range p.list {
		b = append(b, *pl)
	}
	slices.SortStableFunc(b, func(x, y Player) int { return y.Score - x.Score })
	return b
}

// ---------- the lobby ----------

// Lobby gathers players before a game: they join and leave, and once there are
// Min it starts by itself after Wait (or when one of them says start). After a
// game, Open it again: the players stay in.
type Lobby struct {
	Players Players
	Min     int
	Max     int // 0: no limit
	Wait    time.Duration
	Open    bool
	timer   Timer
}

func NewLobby(min, max int, wait time.Duration) *Lobby {
	return &Lobby{Min: min, Max: max, Wait: wait, Open: true}
}

// Message handles "join", "leave" and "start"; true when the game should begin
func (l *Lobby) Message(r *Room, from Viewer, m Msg) bool {
	if !l.Open {
		return false
	}
	switch m.Kind() {
	case "join":
		if !l.Players.Has(from.ID) && (l.Max == 0 || l.Players.Len() < l.Max) && l.Players.Add(from) != nil {
			r.Changed()
		}
	case "leave":
		if l.Players.Remove(from.ID) {
			r.Changed()
		}
	case "start":
		if l.Players.Has(from.ID) && l.Players.Len() >= l.Min {
			return l.begin()
		}
	}
	if l.Players.Len() >= l.Min && !l.timer.Running() {
		l.timer.Set(l.Wait)
	} else if l.Players.Len() < l.Min {
		l.timer.Clear()
	}
	return false
}

// Tick: true when the wait is over and the game should begin
func (l *Lobby) Tick(now time.Time) bool {
	if l.Open && l.timer.Done(now) && l.Players.Len() >= l.Min {
		return l.begin()
	}
	return false
}

func (l *Lobby) begin() bool {
	l.Open = false
	l.timer.Clear()
	return true
}

// Reopen: back to the lobby after a game, everyone still in
func (l *Lobby) Reopen() {
	l.Open = true
	if l.Players.Len() >= l.Min {
		l.timer.Set(l.Wait)
	}
}

// Left drops a viewer who closed their page; true if they were in
func (l *Lobby) Left(v Viewer) bool { return l.Players.Remove(v.ID) }

func (l *Lobby) View(v Viewer) map[string]any {
	return map[string]any{"players": l.Players.Board(), "min": l.Min, "max": l.Max, "left": l.timer.Left(),
		"in": l.Players.Has(v.ID), "named": v.Name != ""}
}

// ---------- turns ----------

// Turns goes round the players, each turn with a time limit
type Turns struct {
	order  []int
	i      int
	rounds int
	Timer  Timer
}

func (t *Turns) Set(ids []int) { t.order, t.i, t.rounds = slices.Clone(ids), 0, 0 }

// Current: whose turn it is; 0 if nobody's
func (t *Turns) Current() int {
	if t.i < 0 || t.i >= len(t.order) {
		return 0
	}
	return t.order[t.i]
}

// Next moves on to the next player, with d for their turn
func (t *Turns) Next(d time.Duration) {
	if t.i++; t.i >= len(t.order) {
		t.i = 0
		t.rounds++
	}
	t.Timer.Set(d)
}

// Rounds: how many times it has gone all the way round
func (t *Turns) Rounds() int { return t.rounds }

// Remove takes a player out; true if it was their turn (the caller calls Next)
func (t *Turns) Remove(id int) bool {
	k := slices.Index(t.order, id)
	if k < 0 {
		return false
	}
	current := k == t.i
	t.order = slices.Delete(t.order, k, k+1)
	if k < t.i || current {
		t.i-- // so Next lands on whoever came after them
	}
	return current
}

func (t *Turns) Len() int { return len(t.order) }

// ---------- votes ----------

// Vote: each voter picks one of n options (and may change their mind); an
// option can have an owner, who can't vote for it
type Vote struct {
	N       int
	ballots map[int]int
	owners  map[int]int // option -> its owner's id
}

func NewVote(n int) *Vote { return &Vote{N: n, ballots: map[int]int{}, owners: map[int]int{}} }

func (v *Vote) Own(option, id int) { v.owners[option] = id }

// Cast: false if it's not an option, or their own
func (v *Vote) Cast(voter, option int) bool {
	if option < 0 || option >= v.N || (v.owners[option] == voter && voter != 0) {
		return false
	}
	v.ballots[voter] = option
	return true
}

func (v *Vote) Voted(voter int) bool { _, ok := v.ballots[voter]; return ok }
func (v *Vote) Choice(voter int) int {
	if c, ok := v.ballots[voter]; ok {
		return c
	}
	return -1
}
func (v *Vote) Count() int { return len(v.ballots) }

func (v *Vote) Counts() []int {
	c := make([]int, v.N)
	for _, o := range v.ballots {
		c[o]++
	}
	return c
}

// Winners: the options with the most votes (none if nobody voted)
func (v *Vote) Winners() []int {
	c := v.Counts()
	top := slices.Max(append(c, 0))
	w := []int{}
	for i, n := range c {
		if n == top && n > 0 {
			w = append(w, i)
		}
	}
	return w
}

// ---------- text ----------

// cut trims s and keeps at most n characters
func cut(s string, n int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > n {
		s = string([]rune(s)[:n])
	}
	return s
}

// Normal: a guess as words are compared: lower case, letters only
func Normal(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if r >= 'a' && r <= 'z' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Shuffle puts s in a random order
func Shuffle[T any](r *Room, s []T) {
	r.Rand.Shuffle(len(s), func(i, j int) { s[i], s[j] = s[j], s[i] })
}
