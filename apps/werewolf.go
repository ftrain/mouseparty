package apps

// Werewolf: a village with werewolves hidden in it. Each night the wolves choose
// someone to eat and the seer (with five or more players) learns what one person
// is. Each day everyone argues in the chat and votes to send someone away. The
// village wins when the wolves are gone; the wolves when they're as many as the
// rest. The host is the narrator: roles stay private, each page sees its own.

import (
	"fmt"
	"time"
)

const (
	wolfNight = 40 * time.Second
	wolfDay   = 90 * time.Second
	wolfOver  = 20 * time.Second
	wolfNews  = 6 // lines of what happened, shown
)

type werewolf struct {
	Base
	lobby  *Lobby
	phase  string         // lobby, night, day, over
	role   map[int]string // wolf, seer, villager
	alive  map[int]bool
	cands  []int // who can be chosen this phase, by vote option; day adds "nobody" at the end
	vote   *Vote
	seen   map[int]string // the seer's findings: id -> role
	seeing int
	news   []string
	winner string
	day    int
	timer  Timer
}

func newWerewolf(*Room) Activity {
	return &werewolf{lobby: NewLobby(4, 16, 20*time.Second), phase: "lobby"}
}

func (w *werewolf) start(r *Room) {
	ids := w.lobby.Players.IDs()
	Shuffle(r, ids)
	w.role, w.alive, w.seen, w.news, w.winner, w.day = map[int]string{}, map[int]bool{}, map[int]string{}, nil, "", 0
	wolves := max(1, len(ids)/4)
	for i, id := range ids {
		w.alive[id] = true
		switch {
		case i < wolves:
			w.role[id] = "wolf"
		case i == wolves && len(ids) >= 5:
			w.role[id] = "seer"
		default:
			w.role[id] = "villager"
		}
	}
	if wolves == 1 {
		w.tell("Night falls. There is a wolf among you.")
	} else {
		w.tell(fmt.Sprintf("Night falls. There are %d wolves among you.", wolves))
	}
	w.night()
}

func (w *werewolf) tell(line string) {
	w.news = append(w.news, line)
	if len(w.news) > wolfNews {
		w.news = w.news[len(w.news)-wolfNews:]
	}
}

func (w *werewolf) living(not string) []int {
	ids := []int{}
	for _, id := range w.lobby.Players.IDs() {
		if w.alive[id] && w.role[id] != not {
			ids = append(ids, id)
		}
	}
	return ids
}

func (w *werewolf) night() {
	w.phase, w.seeing = "night", 0
	w.cands = w.living("wolf")
	w.vote = NewVote(len(w.cands))
	w.timer.Set(wolfNight)
}

func (w *werewolf) dawn(r *Room) {
	w.day++
	if win := w.vote.Winners(); len(win) > 0 {
		victim := w.cands[win[r.Rand.IntN(len(win))]]
		w.alive[victim] = false
		w.tell(fmt.Sprintf("Day %d: %s was eaten in the night. They were a %s.", w.day, w.lobby.Players.Name(victim), w.role[victim]))
	} else {
		w.tell(fmt.Sprintf("Day %d: nobody was eaten.", w.day))
	}
	if w.seeing != 0 {
		w.seen[w.seeing] = w.role[w.seeing]
	}
	if w.checkWin() {
		return
	}
	w.phase = "day"
	w.cands = w.living("")
	w.vote = NewVote(len(w.cands) + 1) // the last: send nobody away
	w.timer.Set(wolfDay)
}

func (w *werewolf) dusk(r *Room) {
	win := w.vote.Winners()
	if len(win) == 1 && win[0] < len(w.cands) {
		out := w.cands[win[0]]
		w.alive[out] = false
		w.tell(fmt.Sprintf("The village sent %s away. They were a %s.", w.lobby.Players.Name(out), w.role[out]))
	} else {
		w.tell("The village couldn't agree, and nobody was sent away.")
	}
	if !w.checkWin() {
		w.tell("Night falls.")
		w.night()
	}
}

func (w *werewolf) checkWin() bool {
	wolves, rest := 0, 0
	for id, alive := range w.alive {
		if alive && w.role[id] == "wolf" {
			wolves++
		} else if alive {
			rest++
		}
	}
	switch {
	case wolves == 0:
		w.winner = "village"
		w.tell("The wolves are gone. The village wins.")
	case wolves >= rest:
		w.winner = "wolves"
		w.tell("The wolves outnumber the village. The wolves win.")
	default:
		return false
	}
	w.phase = "over"
	w.timer.Set(wolfOver)
	return true
}

func (w *werewolf) Message(r *Room, from Viewer, m Msg) {
	if w.phase == "lobby" {
		if w.lobby.Message(r, from, m) {
			w.start(r)
		}
		r.Changed()
		return
	}
	if !w.alive[from.ID] {
		return
	}
	target, ok := m.Int("i", 0, w.vote.N-1)
	if !ok {
		return
	}
	switch {
	case m.Kind() == "kill" && w.phase == "night" && w.role[from.ID] == "wolf":
		w.vote.Cast(from.ID, target)
	case m.Kind() == "see" && w.phase == "night" && w.role[from.ID] == "seer" && w.seeing == 0:
		if target < len(w.cands) {
			w.seeing = w.cands[target]
		}
	case m.Kind() == "exile" && w.phase == "day":
		w.vote.Cast(from.ID, target)
	default:
		return
	}
	r.Changed()
}

func (w *werewolf) Tick(r *Room, now time.Time) {
	switch {
	case w.phase == "lobby":
		if w.lobby.Tick(now) {
			w.start(r)
			r.Changed()
		}
	case !w.timer.Done(now):
	case w.phase == "night":
		w.dawn(r)
		r.Changed()
	case w.phase == "day":
		w.dusk(r)
		r.Changed()
	case w.phase == "over":
		w.phase = "lobby"
		w.lobby.Reopen()
		r.Changed()
	}
}

func (w *werewolf) Left(r *Room, v Viewer) {
	if !w.lobby.Players.Has(v.ID) {
		return
	}
	if w.phase != "lobby" && w.alive[v.ID] {
		w.alive[v.ID] = false
		w.tell(fmt.Sprintf("%s wandered off. They were a %s.", v.Name, w.role[v.ID]))
		w.checkWin()
	}
	if w.phase == "lobby" || w.phase == "over" {
		w.lobby.Left(v)
	}
	r.Changed()
}

func (w *werewolf) View(v Viewer) any {
	view := map[string]any{"phase": w.phase, "lobby": w.lobby.View(v), "news": w.news}
	if w.phase == "lobby" {
		return view
	}
	role := w.role[v.ID]
	cands := []map[string]any{}
	for _, id := range w.cands {
		cands = append(cands, map[string]any{"name": w.lobby.Players.Name(id)})
	}
	players := []map[string]any{}
	for _, p := range w.lobby.Players.List() {
		x := map[string]any{"name": p.Name, "alive": w.alive[p.ID]}
		if !w.alive[p.ID] || w.phase == "over" || (role == "wolf" && w.role[p.ID] == "wolf") {
			x["role"] = w.role[p.ID]
		} else if r, ok := w.seen[p.ID]; ok && role == "seer" {
			x["role"] = r
		}
		players = append(players, x)
	}
	view["role"], view["alive"], view["players"], view["left"] = role, w.alive[v.ID], players, w.timer.Left()
	view["winner"], view["day"], view["choices"] = w.winner, w.day, cands
	if w.vote != nil {
		view["choice"] = w.vote.Choice(v.ID)
		if w.phase == "day" || role == "wolf" { // the day's vote is open; the wolves see each other's
			view["counts"] = w.vote.Counts()
		}
	}
	if role == "seer" && w.seeing != 0 {
		view["seeing"] = w.lobby.Players.Name(w.seeing)
	}
	return view
}
