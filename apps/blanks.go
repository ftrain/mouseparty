package apps

// Blanks: a sentence with a blank; everyone fills it in, then everyone votes for
// the best (not their own). A vote is a point. Then the next sentence.

import (
	"slices"
	"time"
)

const (
	blanksWrite   = 60 * time.Second
	blanksVote    = 30 * time.Second
	blanksResults = 10 * time.Second
	blanksMax     = 80 // characters in an answer
)

var blanksPrompts = []string{
	"The real reason the movie is so long: ___.",
	"The sequel nobody asked for: ___ 2.",
	"What the villain should have done instead: ___.",
	"The snack that would ruin this movie: ___.",
	"A terrible name for a boat: ___.",
	"The worst thing to whisper during a movie: ___.",
	"My secret talent is ___.",
	"The trailer left out the part with ___.",
	"Coming soon to a theater near you: ___: The Musical.",
	"What the hero keeps in their pocket: ___.",
	"The least helpful superpower: ___.",
	"The director's cut adds forty minutes of ___.",
	"An unexpected guest star: ___.",
	"What the dog was thinking the whole time: ___.",
	"The most suspicious thing to find in a fridge: ___.",
	"A theme park ride based on this movie would mostly be ___.",
	"The movie's original title, before they changed it: ___.",
	"What's really in the briefcase: ___.",
	"Nobody tells you that adulthood is mostly ___.",
	"The award this movie deserves: Best ___.",
	"A bad thing to say at the end of a first date: ___.",
	"The plot twist: it was ___ all along.",
	"What I'd bring to a desert island: ___.",
	"The next big diet trend: only eating ___.",
	"A ringtone that would get you kicked out of the theater: ___.",
	"What the sidekick does on their day off: ___.",
	"A name for a band made of everyone watching: ___.",
	"The reason the lights flickered: ___.",
	"An inspirational poster that just says ___.",
	"If this movie were a smell, it would be ___.",
	"The worst thing to hear from a pilot: ___.",
	"The one thing that would have fixed the ending: ___.",
	"A fortune cookie that says ___.",
	"What the robot really wants: ___.",
	"The house rule everyone breaks: ___.",
	"A new holiday that celebrates ___.",
	"The emergency kit is just ___.",
	"What the narrator didn't tell us: ___.",
	"The perfect weapon against zombies: ___.",
	"The museum's newest exhibit: ___.",
}

type blanksEntry struct {
	Text string `json:"text"`
	Name string `json:"name,omitempty"`
	ID   int    `json:"-"`
}

type blanks struct {
	Base
	players Players
	order   []string
	prompt  string
	phase   string // "write", "vote" or "results"
	answers map[int]string
	entries []blanksEntry
	vote    *Vote
	timer   Timer
}

func newBlanks(r *Room) Activity {
	b := &blanks{order: slices.Clone(blanksPrompts)}
	Shuffle(r, b.order)
	b.next()
	return b
}

func (b *blanks) next() {
	b.prompt, b.order = b.order[0], append(b.order[1:], b.order[0])
	b.phase, b.answers, b.entries, b.vote = "write", map[int]string{}, nil, nil
	b.timer.Set(blanksWrite)
}

func (b *blanks) Message(r *Room, from Viewer, m Msg) {
	p := b.players.Add(from)
	if p == nil {
		return
	}
	switch {
	case m.Kind() == "answer" && b.phase == "write":
		if a := m.Str("text", blanksMax); a != "" {
			b.answers[from.ID] = a
			r.Changed()
		}
	case m.Kind() == "vote" && b.phase == "vote":
		if i, ok := m.Int("i", 0, len(b.entries)-1); ok && b.vote.Cast(from.ID, i) {
			r.Changed()
		}
	}
}

func (b *blanks) Tick(r *Room, now time.Time) {
	if !b.timer.Done(now) {
		return
	}
	switch b.phase {
	case "write":
		if len(b.answers) < 2 { // nothing to vote between yet: more time
			b.timer.Set(blanksWrite / 2)
			return
		}
		for id, a := range b.answers {
			b.entries = append(b.entries, blanksEntry{Text: a, Name: b.players.Name(id), ID: id})
		}
		Shuffle(r, b.entries)
		b.vote = NewVote(len(b.entries))
		for i, e := range b.entries {
			b.vote.Own(i, e.ID)
		}
		b.phase = "vote"
		b.timer.Set(blanksVote)
	case "vote":
		for i, n := range b.vote.Counts() {
			if p := b.players.Get(b.entries[i].ID); p != nil {
				p.Score += n
			}
		}
		b.phase = "results"
		b.timer.Set(blanksResults)
	default:
		b.next()
	}
	r.Changed()
}

func (b *blanks) View(v Viewer) any {
	view := map[string]any{"phase": b.phase, "prompt": b.prompt, "left": b.timer.Left(), "mine": b.answers[v.ID],
		"answered": len(b.answers), "board": b.players.Board(), "named": v.Name != ""}
	if b.vote != nil {
		entries := []map[string]any{}
		counts := b.vote.Counts()
		for i, e := range b.entries {
			x := map[string]any{"text": e.Text, "yours": e.ID == v.ID}
			if b.phase == "results" {
				x["name"], x["votes"] = e.Name, counts[i]
			}
			entries = append(entries, x)
		}
		view["entries"], view["choice"] = entries, b.vote.Choice(v.ID)
	}
	return view
}
