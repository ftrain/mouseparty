package apps

// Word Grid: one 4×4 grid of letter dice for everyone, three minutes to find
// words in it by chaining neighbouring letters (each die once per word). A word
// scores only if nobody else found it, more for longer ones. Then a new grid.

import (
	"slices"
	"strings"
	"time"
)

const (
	gridPlay    = 3 * time.Minute
	gridResults = 20 * time.Second
)

type gridResult struct {
	Name  string     `json:"name"`
	Score int        `json:"score"`
	Words []gridWord `json:"words"`
}

type gridWord struct {
	Word   string `json:"word"`
	Unique bool   `json:"unique"`
}

type wordGrid struct {
	Base
	players Players
	grid    [16]string // lower case; "qu" for the Q
	found   map[int][]string
	phase   string // "play" or "results"
	timer   Timer
	results []gridResult
}

func newWordGrid(r *Room) Activity {
	g := &wordGrid{}
	g.deal(r)
	return g
}

func (g *wordGrid) deal(r *Room) {
	dice := slices.Clone(gridDice)
	Shuffle(r, dice)
	for i, d := range dice {
		face := strings.ToLower(string(d[r.Rand.IntN(6)]))
		if face == "q" {
			face = "qu"
		}
		g.grid[i] = face
	}
	g.found, g.results, g.phase = map[int][]string{}, nil, "play"
	g.timer.Set(gridPlay)
}

// onGrid: can w be spelled by a path of neighbouring dice, each used once
func (g *wordGrid) onGrid(w string) bool {
	var from func(i int, rest string, used uint16) bool
	from = func(i int, rest string, used uint16) bool {
		if used&(1<<i) != 0 || !strings.HasPrefix(rest, g.grid[i]) {
			return false
		}
		rest, used = rest[len(g.grid[i]):], used|1<<i
		if rest == "" {
			return true
		}
		for dr := -1; dr <= 1; dr++ {
			for dc := -1; dc <= 1; dc++ {
				row, col := i/4+dr, i%4+dc
				if (dr != 0 || dc != 0) && row >= 0 && row < 4 && col >= 0 && col < 4 && from(row*4+col, rest, used) {
					return true
				}
			}
		}
		return false
	}
	for i := range 16 {
		if from(i, w, 0) {
			return true
		}
	}
	return false
}

func gridPoints(w string) int {
	switch n := len(w); {
	case n <= 4:
		return 1
	case n == 5:
		return 2
	case n == 6:
		return 3
	case n == 7:
		return 5
	}
	return 11
}

func (g *wordGrid) Message(r *Room, from Viewer, m Msg) {
	if m.Kind() != "word" || g.phase != "play" || g.players.Add(from) == nil {
		return
	}
	w := Normal(m.Str("word", 20))
	why := ""
	switch {
	case len(w) < 3:
		why = "too short"
	case slices.Contains(g.found[from.ID], w):
		why = "got it already"
	case !g.onGrid(w):
		why = "not in the grid"
	case !IsWord(w):
		why = "not a word"
	}
	r.To(from.ID, Msg{"kind": "said", "word": w, "why": why})
	if why == "" {
		g.found[from.ID] = append(g.found[from.ID], w)
		r.Changed()
	}
}

func (g *wordGrid) Tick(r *Room, now time.Time) {
	if !g.timer.Done(now) {
		return
	}
	if g.phase == "results" {
		g.deal(r)
		r.Changed()
		return
	}
	by := map[string]int{} // how many found each word
	for _, words := range g.found {
		for _, w := range words {
			by[w]++
		}
	}
	for _, p := range g.players.List() {
		res := gridResult{Name: p.Name, Words: []gridWord{}}
		for _, w := range g.found[p.ID] {
			unique := by[w] == 1
			if unique {
				res.Score += gridPoints(w)
			}
			res.Words = append(res.Words, gridWord{w, unique})
		}
		p.Score += res.Score
		g.results = append(g.results, res)
	}
	slices.SortStableFunc(g.results, func(a, b gridResult) int { return b.Score - a.Score })
	g.phase = "results"
	g.timer.Set(gridResults)
	r.Changed()
}

func (g *wordGrid) View(v Viewer) any {
	counts := []map[string]any{}
	for _, p := range g.players.List() {
		counts = append(counts, map[string]any{"name": p.Name, "found": len(g.found[p.ID])})
	}
	mine := g.found[v.ID]
	if mine == nil {
		mine = []string{}
	}
	return map[string]any{"phase": g.phase, "left": g.timer.Left(), "grid": g.grid, "mine": mine, "counts": counts,
		"results": g.results, "board": g.players.Board(), "named": v.Name != ""}
}
