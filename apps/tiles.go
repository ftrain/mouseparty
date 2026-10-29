package apps

// Tiles: the crossword tile game, two to four players. Each has seven letter
// tiles nobody else sees; on their turn they lay some in one line, joined to
// what's on the board, making words ENABLE knows. Premium squares double or
// triple a letter or a word; all seven at once is 50 more. It ends when the bag
// and a rack are empty, or everyone passes twice.

import (
	"fmt"
	"slices"
	"strings"
	"time"
)

const (
	tilesTurn = 2 * time.Minute
	tilesOver = 30 * time.Second
	tilesRack = 7
	tilesSize = 15
)

// The premium squares: T triple word, D double word, t triple letter, d double letter
var tilesPremium = func() [tilesSize]string {
	var rows [tilesSize][tilesSize]byte
	set := func(c byte, cells ...[2]int) {
		for _, rc := range cells {
			for _, p := range [][2]int{{rc[0], rc[1]}, {rc[1], rc[0]}, {14 - rc[0], rc[1]}, {rc[0], 14 - rc[1]},
				{14 - rc[0], 14 - rc[1]}, {rc[1], 14 - rc[0]}, {14 - rc[1], rc[0]}, {14 - rc[1], 14 - rc[0]}} {
				rows[p[0]][p[1]] = c
			}
		}
	}
	set('T', [2]int{0, 0}, [2]int{0, 7})
	set('D', [2]int{1, 1}, [2]int{2, 2}, [2]int{3, 3}, [2]int{4, 4}, [2]int{7, 7})
	set('t', [2]int{1, 5}, [2]int{5, 5})
	set('d', [2]int{0, 3}, [2]int{2, 6}, [2]int{3, 7}, [2]int{6, 6})
	var out [tilesSize]string
	for i, row := range rows {
		s := []byte(strings.Repeat(".", tilesSize))
		for j, c := range row {
			if c != 0 {
				s[j] = c
			}
		}
		out[i] = string(s)
	}
	return out
}()

type tiles struct {
	Base
	lobby  *Lobby
	phase  string // lobby, play, over
	turns  Turns
	board  [tilesSize][tilesSize]byte // 0: empty
	bag    []byte
	racks  map[int][]byte
	passes int
	last   string
	timer  Timer
}

func newTiles(*Room) Activity {
	return &tiles{lobby: NewLobby(1, 4, 20*time.Second), phase: "lobby"}
}

func (t *tiles) start(r *Room) {
	t.board, t.bag, t.racks, t.passes, t.last = [tilesSize][tilesSize]byte{}, nil, map[int][]byte{}, 0, ""
	for l, n := range tileCounts {
		for range n {
			t.bag = append(t.bag, byte(l))
		}
	}
	Shuffle(r, t.bag)
	for _, p := range t.lobby.Players.List() {
		p.Score = 0
		t.racks[p.ID] = nil
		t.draw(p.ID)
	}
	ids := t.lobby.Players.IDs()
	Shuffle(r, ids)
	t.turns.Set(ids)
	t.turns.Timer.Set(tilesTurn)
	t.phase = "play"
}

func (t *tiles) draw(id int) {
	n := min(tilesRack-len(t.racks[id]), len(t.bag))
	t.racks[id] = append(t.racks[id], t.bag[:n]...)
	t.bag = t.bag[n:]
}

type placed struct {
	r, c   int
	letter byte
}

// play checks a move and scores it; why says what's wrong with it
func (t *tiles) play(rack []byte, move []placed) (score int, words []string, why string) {
	if len(move) == 0 {
		return 0, nil, "Put some tiles on the board."
	}
	left := slices.Clone(rack)
	first := t.board[7][7] == 0
	sameRow, sameCol := true, true
	for _, p := range move {
		if p.r < 0 || p.r >= tilesSize || p.c < 0 || p.c >= tilesSize || t.board[p.r][p.c] != 0 {
			return 0, nil, "That square is taken."
		}
		k := slices.Index(left, p.letter)
		if k < 0 {
			return 0, nil, "Those aren't your tiles."
		}
		left = slices.Delete(left, k, k+1)
		sameRow, sameCol = sameRow && p.r == move[0].r, sameCol && p.c == move[0].c
	}
	if !sameRow && !sameCol {
		return 0, nil, "Tiles go in one line."
	}
	b := t.board // the board with the move on it
	isNew := map[[2]int]bool{}
	for _, p := range move {
		if isNew[[2]int{p.r, p.c}] {
			return 0, nil, "Two tiles on one square."
		}
		b[p.r][p.c], isNew[[2]int{p.r, p.c}] = p.letter, true
	}
	dr, dc := 0, 1 // along the line: across, unless it's down
	if !sameRow || (len(move) == 1 && (move[0].r > 0 && b[move[0].r-1][move[0].c] != 0 || move[0].r < 14 && b[move[0].r+1][move[0].c] != 0)) {
		dr, dc = 1, 0
	}
	// word: the whole run through (r, c) along (dr, dc), and its score
	word := func(r, c, dr, dc int) (string, int) {
		for r-dr >= 0 && c-dc >= 0 && b[r-dr][c-dc] != 0 {
			r, c = r-dr, c-dc
		}
		var w []byte
		sum, mult := 0, 1
		for ; r < tilesSize && c < tilesSize && b[r][c] != 0; r, c = r+dr, c+dc {
			w = append(w, b[r][c])
			v := tileValues[rune(b[r][c])]
			if isNew[[2]int{r, c}] {
				switch tilesPremium[r][c] {
				case 'd':
					v *= 2
				case 't':
					v *= 3
				case 'D':
					mult *= 2
				case 'T':
					mult *= 3
				}
			}
			sum += v
		}
		return string(w), sum * mult
	}
	main, s := word(move[0].r, move[0].c, dr, dc)
	// every new tile must be in that one run (no gaps)
	count := 0
	for _, p := range move {
		r, c := move[0].r, move[0].c
		for r-dr >= 0 && c-dc >= 0 && b[r-dr][c-dc] != 0 {
			r, c = r-dr, c-dc
		}
		for ; r < tilesSize && c < tilesSize && b[r][c] != 0; r, c = r+dr, c+dc {
			if r == p.r && c == p.c {
				count++
				break
			}
		}
	}
	if count != len(move) {
		return 0, nil, "Tiles must join up, with no gaps."
	}
	if len(main) < 2 {
		return 0, nil, "Words are two letters or more."
	}
	words, score = []string{main}, s
	touches := len(main) > len(move)
	for _, p := range move {
		if w, s := word(p.r, p.c, dc, dr); len(w) > 1 {
			words, score, touches = append(words, w), score+s, true
		}
	}
	if first && !isNew[[2]int{7, 7}] {
		return 0, nil, "The first word goes through the middle square."
	}
	if !first && !touches {
		return 0, nil, "Words must join what's on the board."
	}
	for _, w := range words {
		if !IsWord(w) {
			return 0, nil, strings.ToUpper(w) + " isn't a word."
		}
	}
	if len(move) == tilesRack {
		score += 50
	}
	return score, words, ""
}

func (t *tiles) Message(r *Room, from Viewer, m Msg) {
	if t.phase == "lobby" {
		if t.lobby.Message(r, from, m) {
			t.start(r)
		}
		r.Changed()
		return
	}
	if t.phase != "play" || t.turns.Current() != from.ID {
		return
	}
	name := t.lobby.Players.Name(from.ID)
	switch m.Kind() {
	case "play":
		raw, _ := m["tiles"].([]any)
		var move []placed
		for _, x := range raw {
			tm, ok := x.(map[string]any)
			if !ok {
				return
			}
			rr, ok1 := Msg(tm).Int("r", 0, tilesSize-1)
			cc, ok2 := Msg(tm).Int("c", 0, tilesSize-1)
			l := strings.ToUpper(Msg(tm).Str("l", 1))
			if !ok1 || !ok2 || len(l) != 1 || l[0] < 'A' || l[0] > 'Z' || len(move) >= tilesRack {
				return
			}
			move = append(move, placed{rr, cc, l[0]})
		}
		score, words, why := t.play(t.racks[from.ID], move)
		if why != "" {
			r.To(from.ID, Msg{"kind": "nope", "why": why})
			return
		}
		for _, p := range move {
			t.board[p.r][p.c] = p.letter
			k := slices.Index(t.racks[from.ID], p.letter)
			t.racks[from.ID] = slices.Delete(t.racks[from.ID], k, k+1)
		}
		t.lobby.Players.Get(from.ID).Score += score
		t.last = fmt.Sprintf("%s played %s for %d.", name, strings.ToUpper(strings.Join(words, ", ")), score)
		t.passes = 0
		t.draw(from.ID)
		if len(t.racks[from.ID]) == 0 {
			t.end(from.ID)
		} else {
			t.next()
		}
	case "swap":
		letters := strings.ToUpper(m.Str("letters", tilesRack))
		rack := slices.Clone(t.racks[from.ID])
		for i := range len(letters) {
			k := slices.Index(rack, letters[i])
			if k < 0 || len(t.bag) < len(letters) {
				r.To(from.ID, Msg{"kind": "nope", "why": "Can't swap those."})
				return
			}
			rack = slices.Delete(rack, k, k+1)
		}
		t.bag = append(t.bag, letters...)
		Shuffle(r, t.bag)
		t.racks[from.ID] = rack
		t.draw(from.ID)
		t.last = fmt.Sprintf("%s swapped %d tiles.", name, len(letters))
		t.pass()
	case "pass":
		t.last = name + " passed."
		t.pass()
	default:
		return
	}
	r.Changed()
}

func (t *tiles) pass() {
	if t.passes++; t.passes >= 2*t.turns.Len() {
		t.end(0)
	} else {
		t.next()
	}
}

func (t *tiles) next() { t.turns.Next(tilesTurn) }

// end: the tiles left in each rack count against it, and to whoever went out
func (t *tiles) end(out int) {
	for id, rack := range t.racks {
		v := 0
		for _, l := range rack {
			v += tileValues[rune(l)]
		}
		if p := t.lobby.Players.Get(id); p != nil {
			p.Score -= v
		}
		if p := t.lobby.Players.Get(out); p != nil {
			p.Score += v
		}
	}
	if b := t.lobby.Players.Board(); len(b) > 0 {
		t.last += fmt.Sprintf(" Game over: %s wins.", b[0].Name)
	}
	t.phase = "over"
	t.timer.Set(tilesOver)
}

func (t *tiles) Tick(r *Room, now time.Time) {
	switch {
	case t.phase == "lobby":
		if t.lobby.Tick(now) {
			t.start(r)
			r.Changed()
		}
	case t.phase == "play" && t.turns.Timer.Done(now):
		t.last = t.lobby.Players.Name(t.turns.Current()) + " ran out of time."
		t.pass()
		r.Changed()
	case t.phase == "over" && t.timer.Done(now):
		t.phase = "lobby"
		t.lobby.Reopen()
		r.Changed()
	}
}

func (t *tiles) Left(r *Room, v Viewer) {
	if !t.lobby.Players.Has(v.ID) {
		return
	}
	if t.phase == "play" {
		t.bag = append(t.bag, t.racks[v.ID]...)
		delete(t.racks, v.ID)
		if t.turns.Remove(v.ID) {
			t.next()
		}
		if t.turns.Len() == 0 {
			t.end(0)
		}
	}
	t.lobby.Left(v)
	r.Changed()
}

func (t *tiles) View(v Viewer) any {
	view := map[string]any{"phase": t.phase, "lobby": t.lobby.View(v), "board": t.lobby.Players.Board()}
	if t.phase == "lobby" {
		return view
	}
	var rows [tilesSize]string
	for i, row := range t.board {
		s := []byte(strings.Repeat(".", tilesSize))
		for j, c := range row {
			if c != 0 {
				s[j] = c
			}
		}
		rows[i] = string(s)
	}
	view["grid"], view["premium"], view["rack"], view["bag"] = rows, tilesPremium, string(t.racks[v.ID]), len(t.bag)
	view["turn"], view["mine"], view["left"], view["last"] = t.lobby.Players.Name(t.turns.Current()), t.turns.Current() == v.ID, t.turns.Timer.Left(), t.last
	values := map[string]int{}
	for l, v := range tileValues {
		values[string(l)] = v
	}
	view["values"] = values
	return view
}
