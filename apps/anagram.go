package apps

// Anagrams: a scrambled everyday word; first to unscramble it scores (any real
// word using all the letters counts). Then the next one.

import (
	"slices"
	"time"
)

const (
	anagramGuess  = 40 * time.Second
	anagramReveal = 4 * time.Second
)

type anagram struct {
	Base
	players Players
	word    string
	letters string
	phase   string // "guess" or "reveal"
	winner  string
	answer  string
	timer   Timer
}

func newAnagram(r *Room) Activity {
	a := &anagram{}
	a.next(r)
	return a
}

func (a *anagram) next(r *Room) {
	for {
		a.word = Common[r.Rand.IntN(len(Common))]
		if len(a.word) >= 5 && len(a.word) <= 8 {
			break
		}
	}
	b := []byte(a.word)
	for string(b) == a.word {
		Shuffle(r, b)
	}
	a.letters, a.phase, a.winner, a.answer = string(b), "guess", "", ""
	a.timer.Set(anagramGuess)
}

func sameLetters(x, y string) bool {
	a, b := []byte(x), []byte(y)
	slices.Sort(a)
	slices.Sort(b)
	return string(a) == string(b)
}

func (a *anagram) Message(r *Room, from Viewer, m Msg) {
	if m.Kind() != "guess" || a.phase != "guess" || from.Name == "" {
		return
	}
	g := Normal(m.Str("guess", 20))
	if g != a.word && !(sameLetters(g, a.word) && IsWord(g)) {
		r.To(from.ID, Msg{"kind": "wrong", "guess": g})
		return
	}
	a.players.Add(from).Score++
	a.phase, a.winner, a.answer = "reveal", from.Name, g
	a.timer.Set(anagramReveal)
	r.Changed()
}

func (a *anagram) Tick(r *Room, now time.Time) {
	if !a.timer.Done(now) {
		return
	}
	if a.phase == "guess" {
		a.phase, a.answer = "reveal", a.word
		a.timer.Set(anagramReveal)
	} else {
		a.next(r)
	}
	r.Changed()
}

func (a *anagram) View(v Viewer) any {
	return map[string]any{"phase": a.phase, "letters": a.letters, "left": a.timer.Left(), "winner": a.winner,
		"answer": a.answer, "board": a.players.Board(), "named": v.Name != ""}
}
