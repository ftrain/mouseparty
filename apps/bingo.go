package apps

// Bingo plays itself along with the movie: each page gets a card of words from
// the movie's own subtitles, and a square fills in when its word is said. Five in
// a row (or column, or diagonal) wins. With no subtitles to listen to, the host
// calls a word every so often instead, from the everyday words.

import (
	"slices"
	"strings"
	"time"
)

const (
	bingoCall = 8 * time.Second // between called words, when there are no subtitles
	bingoPool = 50              // words called from, then
)

// Words too common to be worth a square
var bingoSkip = map[string]bool{}

func init() {
	for _, w := range strings.Fields(`about after again also always another around back because been before being
		could didn does doesn done down even ever every from going gonna gotta have here into just know like little
		look make many maybe more most much must need never nothing okay only other over please really right said
		should some something still sure take tell than thank thanks that their them then there these they thing
		think this those through time very want wanna well were what when where which while will with would yeah
		your yours youre thats dont cant wont isnt aren come came going good mean make sorry hello maybe`) {
		bingoSkip[w] = true
	}
}

type bingoCard struct {
	Words [25]string // the middle one is free
	Won   bool
}

type bingo struct {
	Base
	pool      []string
	fromMovie bool
	lines     []Line
	heard     float64 // movie seconds listened up to
	said      map[string]bool
	recent    []string // the latest words heard or called
	cards     map[int]*bingoCard
	winners   []string
	call      Timer
}

func newBingo(r *Room) Activity {
	b := &bingo{said: map[string]bool{}, cards: map[int]*bingoCard{}, heard: -1}
	if r.Movie != nil {
		b.lines = r.Movie.Lines()
		from, _ := r.Movie.Position()
		seen := map[string]bool{}
		for _, l := range b.lines {
			if l.Start < from {
				continue
			}
			for _, w := range strings.Fields(l.Text) {
				if w = Normal(w); len(w) >= 4 && !bingoSkip[w] && !seen[w] && IsWord(w) {
					seen[w] = true
					b.pool = append(b.pool, w)
				}
			}
		}
		b.fromMovie = len(b.pool) >= 40
	}
	if !b.fromMovie {
		b.pool = slices.Clone(Common)
		Shuffle(r, b.pool)
		b.pool = b.pool[:bingoPool] // called in this order
		b.call.Set(bingoCall)
	}
	return b
}

func (b *bingo) card(r *Room, id int) *bingoCard {
	c := b.cards[id]
	if c == nil {
		words := slices.Clone(b.pool)
		Shuffle(r, words)
		c = &bingoCard{}
		copy(c.Words[:], words)
		c.Words[12] = ""
		b.cards[id] = c
	}
	return c
}

func (b *bingo) View(v Viewer) any {
	c := b.cards[v.ID]
	view := map[string]any{"movie": b.fromMovie, "recent": b.recent, "winners": b.winners, "next": b.call.Left()}
	if c != nil {
		marked := [25]bool{}
		for i, w := range c.Words {
			marked[i] = w == "" || b.said[w]
		}
		view["card"], view["marked"], view["won"] = c.Words, marked, c.Won
	}
	return view
}

func (b *bingo) Joined(r *Room, v Viewer) {
	if b.cards[v.ID] == nil {
		b.card(r, v.ID)
		r.Changed()
	}
}

func (b *bingo) Message(r *Room, from Viewer, m Msg) {
	if m.Kind() == "card" { // a page that came before its card was dealt
		b.Joined(r, from)
	}
}

func (b *bingo) Tick(r *Room, now time.Time) {
	var heard []string
	if b.fromMovie {
		pos, ok := r.Movie.Position()
		if !ok {
			return
		}
		if b.heard < 0 || pos < b.heard || pos-b.heard > 10 { // a seek: start listening from here
			b.heard = pos
			return
		}
		for _, l := range b.lines {
			if l.Start > b.heard && l.Start <= pos {
				for _, w := range strings.Fields(l.Text) {
					heard = append(heard, Normal(w))
				}
			}
		}
		b.heard = pos
	} else if b.call.Done(now) {
		b.call.Set(bingoCall)
		for _, w := range b.pool {
			if !b.said[w] {
				heard = append(heard, w)
				break
			}
		}
		r.Changed()
	}
	for _, w := range heard {
		if w != "" && !b.said[w] && slices.Contains(b.pool, w) {
			b.said[w] = true
			b.recent = append([]string{w}, b.recent...)[:min(len(b.recent)+1, 6)]
			r.Changed()
		}
	}
	if len(heard) > 0 {
		b.checkWins(r)
	}
}

// checkWins: any card with a full line has won
func (b *bingo) checkWins(r *Room) {
	lines := [][5]int{}
	for i := range 5 {
		lines = append(lines, [5]int{i * 5, i*5 + 1, i*5 + 2, i*5 + 3, i*5 + 4}, [5]int{i, i + 5, i + 10, i + 15, i + 20})
	}
	lines = append(lines, [5]int{0, 6, 12, 18, 24}, [5]int{4, 8, 12, 16, 20})
	names := map[int]string{}
	for _, v := range r.Viewers() {
		names[v.ID] = v.Name
	}
	for id, c := range b.cards {
		if c.Won {
			continue
		}
		for _, l := range lines {
			full := true
			for _, i := range l {
				full = full && (c.Words[i] == "" || b.said[c.Words[i]])
			}
			if full {
				c.Won = true
				name := names[id]
				if name == "" {
					name = "Someone"
				}
				b.winners = append(b.winners, name)
				r.All(Msg{"kind": "bingo", "name": name})
				r.Changed()
				break
			}
		}
	}
}
