package apps

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"strings"
	"testing"
	"time"
)

// testRoom: a Room whose messages are kept, for these viewers
type sent struct {
	to  int
	msg map[string]any
}

func testRoom(viewers ...Viewer) (*Room, *[]sent) {
	var out []sent
	r := &Room{Rand: rand.New(rand.NewPCG(1, 2)),
		send:    func(to int, m map[string]any) { out = append(out, sent{to, m}) },
		viewers: func() []Viewer { return viewers }}
	return r, &out
}

var (
	ann = Viewer{1, "Ann"}
	bob = Viewer{2, "Bob"}
	cat = Viewer{3, "Cat"}
	dan = Viewer{4, "Dan"}
	eve = Viewer{5, "Eve"}
)

func later(d time.Duration) time.Time { return time.Now().Add(d) }

func TestWords(t *testing.T) {
	if !IsWord("cat") || !IsWord("QUIXOTIC") || IsWord("zzxq") || IsWord("") {
		t.Fatal("ENABLE isn't answering right")
	}
	for _, w := range Common {
		if !IsWord(w) || w != Normal(w) {
			t.Errorf("%q: not a plain ENABLE word", w)
		}
	}
	if len(Common) < 300 {
		t.Fatal(len(Common))
	}
}

func TestLobbyTurnsVote(t *testing.T) {
	r, _ := testRoom(ann, bob, cat)
	l := NewLobby(2, 3, 10*time.Second)
	if l.Message(r, Viewer{9, ""}, Msg{"kind": "join"}) || l.Players.Len() != 0 {
		t.Fatal("joined without a name")
	}
	l.Message(r, ann, Msg{"kind": "join"})
	if l.Message(r, ann, Msg{"kind": "start"}) {
		t.Fatal("started with one")
	}
	l.Message(r, bob, Msg{"kind": "join"})
	if l.Tick(time.Now()) || !l.Tick(later(11*time.Second)) || l.Open {
		t.Fatal("didn't start after the wait")
	}

	var tu Turns
	tu.Set([]int{1, 2, 3})
	tu.Next(time.Minute) // 2's turn
	if tu.Current() != 2 || !tu.Remove(2) {
		t.Fatal(tu.Current())
	}
	tu.Next(time.Minute)
	if tu.Current() != 3 {
		t.Fatal("after the one who left:", tu.Current())
	}
	tu.Next(time.Minute)
	if tu.Current() != 1 || tu.Rounds() != 1 {
		t.Fatal(tu.Current(), tu.Rounds())
	}

	v := NewVote(3)
	v.Own(0, 1)
	if v.Cast(1, 0) || !v.Cast(1, 1) || !v.Cast(2, 1) || !v.Cast(3, 2) {
		t.Fatal("ballots")
	}
	if w := v.Winners(); len(w) != 1 || w[0] != 1 {
		t.Fatal(w)
	}
}

func TestSessionSendsViews(t *testing.T) {
	var out []sent
	viewers := []Viewer{ann, bob}
	kind, _ := Lookup("anagram")
	s := Start(kind, 3, "Ann", func(to int, m map[string]any) { out = append(out, sent{to, m}) },
		func() []Viewer { return viewers }, Env{})
	defer s.Stop()
	if info := s.Info(ann); len(out) != 0 || info["id"] != 3 || info["name"] != "anagram" || info["by"] != "Ann" || info["view"] == nil {
		t.Fatal(info, out)
	}
	word := s.act.(*anagram).word
	s.Message(bob, map[string]any{"type": "app", "id": 3.0, "kind": "guess", "guess": word})
	if len(out) != 2 || out[0].msg["kind"] != "view" || out[0].msg["id"] != 3 || out[1].to != 2 {
		t.Fatal(out)
	}
	if v := out[1].msg["view"].(map[string]any); v["winner"] != "Bob" || v["answer"] != word {
		t.Fatal(v)
	}
	viewers = append(viewers, Viewer{7, ""}) // a page arrives, then its viewer takes a name: they get a view that lets them play
	n := len(out)
	s.Joined(Viewer{7, "Gus"})
	if len(out) != n+3 || out[n+2].to != 7 || out[n+2].msg["kind"] != "view" {
		t.Fatal(out[n:])
	}
}

func TestWordGrid(t *testing.T) {
	r, out := testRoom(ann, bob)
	g := newWordGrid(r).(*wordGrid)
	copy(g.grid[:], strings.Fields("c a t s  o qu i t  r e d s  x y z w"))
	for w, ok := range map[string]bool{"cat": true, "cats": true, "quit": true, "acta": false, "red": true, "cot": false} {
		if g.onGrid(w) != ok {
			t.Errorf("%s on the grid: %v", w, !ok)
		}
	}
	g.Message(r, ann, Msg{"kind": "word", "word": "Cats"})
	g.Message(r, ann, Msg{"kind": "word", "word": "quit"})
	g.Message(r, bob, Msg{"kind": "word", "word": "quit"})
	g.Message(r, bob, Msg{"kind": "word", "word": "zzz"})
	if last := (*out)[len(*out)-1].msg; last["why"] != "not in the grid" {
		t.Fatal(last)
	}
	g.Tick(r, later(4*time.Minute))
	if g.phase != "results" || g.players.Get(1).Score != 1 || g.players.Get(2).Score != 0 { // QUIT was found by both
		t.Fatal(g.results)
	}
}

func TestTiles(t *testing.T) {
	r, out := testRoom(ann, bob)
	g := newTiles(r).(*tiles)
	g.Message(r, ann, Msg{"kind": "join"})
	g.Message(r, bob, Msg{"kind": "join"})
	g.Message(r, ann, Msg{"kind": "start"})
	if g.phase != "play" || len(g.racks[1]) != 7 || len(g.bag) != 98-14 {
		t.Fatal(g.phase, len(g.bag))
	}
	rack := []byte("CATSXQZ")
	at := func(word string, r0, c0, dr, dc int) []placed {
		var p []placed
		for i := range word {
			p = append(p, placed{r0 + i*dr, c0 + i*dc, word[i]})
		}
		return p
	}
	if _, _, why := g.play(rack, at("CAT", 0, 0, 0, 1)); !strings.Contains(why, "middle") {
		t.Fatal(why)
	}
	if _, _, why := g.play(rack, at("TCA", 7, 6, 0, 1)); !strings.Contains(why, "isn't a word") {
		t.Fatal(why)
	}
	if _, _, why := g.play(rack, at("DOG", 7, 6, 0, 1)); !strings.Contains(why, "your tiles") {
		t.Fatal(why)
	}
	score, words, why := g.play(rack, at("CAT", 7, 6, 0, 1))
	if why != "" || score != 10 || words[0] != "CAT" { // (3+1+1), the middle doubling it
		t.Fatal(score, words, why)
	}
	for _, p := range at("CAT", 7, 6, 0, 1) {
		g.board[p.r][p.c] = p.letter
	}
	if _, _, why := g.play(rack, at("SAT", 0, 0, 0, 1)); !strings.Contains(why, "join") {
		t.Fatal(why)
	}
	score, words, why = g.play(rack, []placed{{7, 9, 'S'}}) // CATS
	if why != "" || words[0] != "CATS" || score != 6 {
		t.Fatal(score, words, why)
	}
	if _, _, why := g.play(rack, []placed{{8, 6, 'A'}, {8, 8, 'A'}}); why == "" {
		t.Fatal("a move with a gap")
	}
	// someone else's turn: ignored
	other := 3 - g.turns.Current()
	n := len(*out)
	g.Message(r, Viewer{other, "x"}, Msg{"kind": "pass"})
	if len(*out) != n || g.last != "" {
		t.Fatal("played out of turn")
	}
}

func TestSpies(t *testing.T) {
	r, _ := testRoom(ann, bob, cat, dan)
	s := newSpies(r).(*spies)
	for _, v := range []Viewer{ann, bob, cat, dan} {
		s.Message(r, v, Msg{"kind": "join"})
	}
	s.Message(r, ann, Msg{"kind": "start"})
	if s.phase != "clue" || s.left("red") != 9 || s.left("blue") != 8 {
		t.Fatal(s.phase)
	}
	master := s.master["red"]
	var operative Viewer
	for _, v := range []Viewer{ann, bob, cat, dan} {
		if s.team[v.ID] == "red" && v.ID != master {
			operative = v
		}
	}
	hidden := func(id int) bool { return s.View(Viewer{ID: id}).(map[string]any)["cards"].([]spyCard)[0].Color == "" }
	if hidden(master) || !hidden(operative.ID) {
		t.Fatal("the spymaster should see colours, and only they")
	}
	s.Message(r, Viewer{master, ""}, Msg{"kind": "clue", "word": s.cards[0].Word, "n": 1.0})
	if s.phase != "clue" {
		t.Fatal("a clue that's on the board")
	}
	s.Message(r, Viewer{master, ""}, Msg{"kind": "clue", "word": "zebraish", "n": 2.0})
	if s.phase != "guess" || s.guesses != 3 {
		t.Fatal(s.phase, s.guesses)
	}
	for i, c := range s.cards {
		if c.Color == "assassin" {
			s.Message(r, operative, Msg{"kind": "pick", "i": float64(i)})
		}
	}
	if s.phase != "over" || s.winner != "blue" {
		t.Fatal(s.phase, s.winner)
	}
}

func TestWerewolf(t *testing.T) {
	everyone := []Viewer{ann, bob, cat, dan, eve}
	r, _ := testRoom(everyone...)
	w := newWerewolf(r).(*werewolf)
	for _, v := range everyone {
		w.Message(r, v, Msg{"kind": "join"})
	}
	w.Message(r, ann, Msg{"kind": "start"})
	count := map[string]int{}
	var wolf Viewer
	for _, v := range everyone {
		count[w.role[v.ID]]++
		if w.role[v.ID] == "wolf" {
			wolf = v
		}
	}
	if count["wolf"] != 1 || count["seer"] != 1 || w.phase != "night" {
		t.Fatal(count, w.phase)
	}
	w.Message(r, wolf, Msg{"kind": "kill", "i": 0.0})
	victim := w.cands[0]
	w.Tick(r, later(time.Minute))
	if w.phase != "day" || w.alive[victim] {
		t.Fatal(w.phase, w.news)
	}
	exile := -1 // everyone else sends the wolf away
	for i, id := range w.cands {
		if id == wolf.ID {
			exile = i
		}
	}
	for _, v := range everyone {
		if w.alive[v.ID] && v.ID != wolf.ID {
			w.Message(r, v, Msg{"kind": "exile", "i": float64(exile)})
		}
	}
	w.Tick(r, later(2*time.Minute))
	if w.phase != "over" || w.winner != "village" {
		t.Fatal(w.phase, w.news)
	}
}

func TestBlanksAndPoll(t *testing.T) {
	r, _ := testRoom(ann, bob)
	b := newBlanks(r).(*blanks)
	b.Message(r, ann, Msg{"kind": "answer", "text": "a llama"})
	b.Message(r, bob, Msg{"kind": "answer", "text": "soup"})
	b.Tick(r, later(2*time.Minute))
	if b.phase != "vote" || len(b.entries) != 2 {
		t.Fatal(b.phase)
	}
	for i, e := range b.entries {
		if e.ID == 2 {
			b.Message(r, ann, Msg{"kind": "vote", "i": float64(i)})
		} else {
			b.Message(r, ann, Msg{"kind": "vote", "i": float64(i)}) // her own: not counted
		}
	}
	b.Tick(r, later(3*time.Minute))
	if b.players.Get(2).Score != 1 || b.players.Get(1).Score != 0 {
		t.Fatal(b.players.Board())
	}

	p := newPoll(r).(*poll)
	p.Message(r, ann, Msg{"kind": "ask", "question": "Pizza?", "options": []any{"yes", "no", ""}})
	p.Message(r, bob, Msg{"kind": "vote", "i": 1.0})
	p.Message(r, bob, Msg{"kind": "close"}) // not his
	if !p.open || p.vote.Counts()[1] != 1 || len(p.options) != 2 {
		t.Fatal(p.open, p.options)
	}
	p.Message(r, ann, Msg{"kind": "close"})
	if p.open {
		t.Fatal("still open")
	}
}

type testMovie struct {
	lines []Line
	pos   float64
	kept  []string
}

func (m *testMovie) Lines() []Line             { return m.lines }
func (m *testMovie) Position() (float64, bool) { return m.pos, true }
func (m *testMovie) Frame() ([]byte, Picture, error) {
	return []byte("png"), Picture{W: 1920, H: 800, At: m.pos, Title: "The Movie"}, nil
}
func (m *testMovie) Keep(b []byte, mime string) (Picture, error) {
	m.kept = append(m.kept, string(b))
	return Picture{Ref: fmt.Sprintf("asset:%d", len(m.kept)), W: 1280, H: 720}, nil
}

func TestBingoListens(t *testing.T) {
	m := &testMovie{}
	words := []string{}
	for i, w := range Common[:60] {
		words = append(words, w)
		m.lines = append(m.lines, Line{Start: float64(i + 1), End: float64(i + 1), Text: "Look, a " + w + "!"})
	}
	r, _ := testRoom(ann)
	r.Movie = m
	b := newBingo(r).(*bingo)
	if !b.fromMovie {
		t.Fatal("didn't take its words from the subtitles")
	}
	b.Joined(r, ann)
	b.Tick(r, time.Now()) // starts listening at 0
	m.pos = 61
	b.Tick(r, time.Now()) // a jump: a seek, nothing heard
	if len(b.said) != 0 {
		t.Fatal("heard through a seek")
	}
	for p := 61.0; p >= 0; p-- { // rewound, then everything
		m.pos = p
		b.Tick(r, time.Now())
	}
	for m.pos = 1; m.pos <= 61; m.pos += 2 {
		b.Tick(r, time.Now())
	}
	if !b.cards[1].Won || len(b.winners) != 1 || b.winners[0] != "Ann" {
		t.Fatal(len(b.said), b.winners)
	}
}

// What the picker says each app needs is what its lobby asks for
func TestKindsSayTheirMinimum(t *testing.T) {
	for _, k := range Kinds {
		r, _ := testRoom()
		act := k.New(r)
		lobby := map[string]*Lobby{}
		switch a := act.(type) {
		case *tiles:
			lobby[k.Name] = a.lobby
		case *sketch:
			lobby[k.Name] = a.lobby
		case *spies:
			lobby[k.Name] = a.lobby
		case *werewolf:
			lobby[k.Name] = a.lobby
		}
		if l := lobby[k.Name]; (l != nil && l.Min != k.Min) || (l == nil && k.Min != 1) {
			t.Errorf("%s: the picker says %d", k.Name, k.Min)
		}
	}
}

// One will do: Tiles starts with one player, and Blanks goes on with one answer when only one is playing
func TestAlone(t *testing.T) {
	r, _ := testRoom(ann)
	g := newTiles(r).(*tiles)
	g.Message(r, ann, Msg{"kind": "join"})
	g.Message(r, ann, Msg{"kind": "start"})
	if g.phase != "play" || len(g.racks[1]) != 7 {
		t.Fatal(g.phase)
	}
	g.Message(r, ann, Msg{"kind": "pass"})
	g.Message(r, ann, Msg{"kind": "pass"})
	if g.phase != "over" {
		t.Fatal("two passes alone didn't end it:", g.phase)
	}

	b := newBlanks(r).(*blanks)
	b.Message(r, ann, Msg{"kind": "answer", "text": "a llama"})
	b.Tick(r, later(2*time.Minute))
	if b.phase != "vote" || len(b.entries) != 1 {
		t.Fatal(b.phase)
	}
	r2, _ := testRoom(ann, bob) // two playing: one answer waits for another
	b2 := newBlanks(r2).(*blanks)
	b2.Message(r2, ann, Msg{"kind": "answer", "text": "a llama"})
	b2.Message(r2, bob, Msg{"kind": "join"})
	b2.Tick(r2, later(2*time.Minute))
	if b2.players.Len() != 2 || b2.phase != "write" {
		t.Fatal("voted on one answer with two playing")
	}
}

func TestKeepersOutlastTheSession(t *testing.T) {
	shelf := &MemShelf{}
	viewers := func() []Viewer { return []Viewer{ann, bob} }
	send := func(int, map[string]any) {}
	start := func(name string) *Session {
		kind, _ := Lookup(name)
		return Start(kind, 1, "Ann", send, viewers, Env{Shelf: shelf})
	}

	g := start("graffiti")
	g.Message(ann, map[string]any{"app": "graffiti", "kind": "line", "c": 1.0, "w": 0.0, "p": []any{[]any{0.1, 0.2}, []any{0.3, 0.4}}})
	g.Stop()
	g = start("graffiti")
	if lines := g.act.(*graffiti).lines; len(lines) != 1 || lines[0].Color != 1 || lines[0].Points[1] != [2]float64{0.3, 0.4} {
		t.Fatal("the wall wasn't kept:", lines)
	}
	g.Stop()

	p := start("poll")
	p.Message(ann, map[string]any{"app": "poll", "kind": "ask", "question": "Pizza?", "options": []any{"yes", "no"}})
	p.Message(bob, map[string]any{"app": "poll", "kind": "vote", "i": 1.0})
	p.Stop() // still open: it comes back closed, with its votes
	p = start("poll")
	defer p.Stop()
	v := p.act.View(Viewer{9, "Cy"}).(map[string]any)
	got := v["poll"].(map[string]any)
	if got["question"] != "Pizza?" || got["open"] != false || got["by"] != "Ann" || got["counts"].([]int)[1] != 1 || v["canAsk"] != true {
		t.Fatal("the poll wasn't kept:", v)
	}

	b := start("bingo") // not a Keeper: nothing written
	b.Stop()
	if shelf.Len() != 2 {
		t.Fatal(shelf)
	}
}

// Call: each one in it has a secret only they see, and a public voice made from it
func TestCall(t *testing.T) {
	r, _ := testRoom(ann, bob, cat)
	c := newCall(r).(*call)
	c.Message(r, Viewer{4, ""}, Msg{"kind": "join"}) // no name, no call
	c.Message(r, ann, Msg{"kind": "join"})
	c.Message(r, bob, Msg{"kind": "join"})
	c.Message(r, bob, Msg{"kind": "live"})
	c.Message(r, ann, Msg{"kind": "mute", "muted": true})
	type view struct {
		People []caller
		Secret string
	}
	see := func(v Viewer) view {
		m := c.View(v).(map[string]any)
		s, _ := m["secret"].(string)
		return view{m["people"].([]caller), s}
	}
	a, b, k := see(ann), see(bob), see(cat)
	if len(a.People) != 2 || a.People[0].Name != "Ann" || !a.People[0].Muted || !a.People[1].Live || a.People[0].Live {
		t.Fatal(a.People)
	}
	if !IsCallName(a.Secret) || !IsCallName(b.Secret) || a.Secret == b.Secret || k.Secret != "" {
		t.Fatal("secrets:", a.Secret, b.Secret, k.Secret)
	}
	if v, _ := CallName(a.Secret); v != a.People[0].Voice || v == a.Secret {
		t.Fatal("ann's voice isn't made from her secret")
	}
	if j, _ := json.Marshal(c.View(cat)); !strings.Contains(string(j), `"voice"`) || strings.Contains(string(j), a.Secret) {
		t.Fatal("a secret is shown to someone else")
	}
	c.Left(r, ann)
	c.Message(r, bob, Msg{"kind": "leave"})
	if len(see(cat).People) != 0 {
		t.Fatal(see(cat).People)
	}
	if _, ok := CallName("../live"); ok || IsCallName("ABCDEF0123456789ABCDEF0123456789") {
		t.Fatal("a name that isn't one")
	}
}
