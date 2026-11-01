package apps

// The apps' fuzzer: a walk over the command graph (Commands), driven by the
// fuzzer's bytes. Viewers come, take names and go; apps open and close; each
// viewer sends each app its commands, mostly well-formed, sometimes not (wrong
// types, out of range, missing fields, kinds that don't exist); time jumps.
// After every step, what must always hold:
//
//   - nothing panics
//   - every view, for every viewer, and every event encodes as JSON
//   - private things stay private: a call's secrets, the spies' key, werewolves
//   - what a Keeper keeps loads back, and keeps the same again
//
// `go test` runs the seeds below; `go test -fuzz FuzzApps ./apps` (scripts/fuzz.sh)
// searches for more, and keeps what fails in testdata/fuzz/FuzzApps.

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"
)

// input: the fuzzer's input, read as choices; once it's used up, the walk ends
type input struct {
	b []byte
	i int
}

func (b *input) done() bool { return b.i >= len(b.b) }

// n: a choice of 0 to k-1
func (b *input) n(k int) int {
	if k <= 1 || b.done() {
		b.i++
		return 0
	}
	v := int(b.b[b.i])
	b.i++
	if k > 256 && !b.done() {
		v = v<<8 | int(b.b[b.i])
		b.i++
	}
	return v % k
}

var names = []string{"Ann", "Bob", "Cat", "Ann", "", "  ", "😀 Zoë", strings.Repeat("w", 60), "<b>x</b>", "Bob"}

// value: a field's value, well-formed three times in four
func value(b *input, f Field) any {
	if b.n(4) == 0 {
		return junk(b, 2)
	}
	switch f.Type {
	case "int":
		return float64(int(f.Lo) + b.n(int(f.Hi-f.Lo)+1))
	case "num":
		return f.Lo + (f.Hi-f.Lo)*float64(b.n(101))/100
	case "bool":
		return b.n(2) == 1
	case "str":
		return text(b, f.Max)
	case "strs":
		out := []any{}
		for range b.n(7) {
			out = append(out, text(b, f.Max))
		}
		return out
	case "points":
		out := []any{}
		for range b.n(12) {
			out = append(out, []any{float64(b.n(101)) / 100, float64(b.n(101)) / 100})
		}
		return out
	case "tiles":
		out := []any{}
		for range b.n(8) {
			out = append(out, map[string]any{"r": float64(b.n(15)), "c": float64(b.n(15)), "l": string(rune('a' + b.n(26)))})
		}
		return out
	case "ops":
		return []string{`[]`, `[{"op":"splice","at":0,"n":0,"blocks":[{"k":"p","t":"hi"}]}]`, `not json`, `[{"op":"nope"}]`, `{}`}[b.n(5)]
	}
	panic("a field type the fuzzer doesn't know: " + f.Type)
}

// text: words, letters, nothing, or too much
func text(b *input, max int) string {
	switch b.n(6) {
	case 0:
		return ""
	case 1:
		return strings.Repeat("x", max+5)
	case 2:
		return Common[b.n(len(Common))]
	case 3:
		return string([]rune("aeiourstln")[b.n(10):])
	case 4:
		return "  \t😀\u0000‮ "
	}
	return strings.ToUpper(Common[b.n(len(Common))])
}

// junk: any JSON value, as encoding/json decodes one
func junk(b *input, depth int) any {
	switch b.n(9) {
	case 0:
		return nil
	case 1:
		return b.n(2) == 1
	case 2:
		return float64(b.n(65536)) - 32768
	case 3:
		return []float64{1e308, -1e308, 0.5, -0.0, 1e-300}[b.n(5)]
	case 4:
		return text(b, 10)
	case 5, 6:
		if depth > 0 {
			out := []any{}
			for range b.n(4) {
				out = append(out, junk(b, depth-1))
			}
			return out
		}
	case 7, 8:
		if depth > 0 {
			return map[string]any{"x": junk(b, depth-1), "c": junk(b, depth-1)}
		}
	}
	return "?"
}

// message: one of the app's commands, or one it doesn't have
func message(b *input, cmds []Command) Msg {
	m := Msg{}
	if len(cmds) == 0 || b.n(10) == 0 {
		m["kind"] = []any{"nope", "", nil, 7.0, "__proto__", "JOIN"}[b.n(6)]
		m["i"] = junk(b, 1)
		return m
	}
	c := cmds[b.n(len(cmds))]
	m["kind"] = c.Kind
	for _, f := range c.Fields {
		if b.n(12) != 0 { // sometimes left out
			m[f.Name] = value(b, f)
		}
	}
	return m
}

// running is an app open in the walk, as an apps.Session would run it
type running struct {
	kind Kind
	act  Activity
	room *Room
}

type walker struct {
	t       *testing.T
	b       *input
	viewers []Viewer
	lastID  int
	open    []*running
	shelf   *MemShelf
	movie   *testMovie
	reel    *Reel
	now     time.Time
	rand    *rand.Rand
}

func (w *walker) list() []Viewer { return slices.Clone(w.viewers) }

// call one thing into an app, then check everything that must hold
func (w *walker) call(app *running, what string, fn func()) {
	w.t.Helper()
	fn()
	if app.room.changed {
		app.room.changed = false
		for _, v := range w.viewers {
			if _, err := json.Marshal(app.act.View(v)); err != nil {
				w.t.Fatalf("%s, after %s: %s's view doesn't encode: %v", app.kind.Name, what, v.Name, err)
			}
		}
	}
	w.private(app, what)
}

func (w *walker) start(kind Kind) *running {
	app := &running{kind: kind}
	app.room = &Room{Movie: w.movie, Reel: w.reel, Rand: w.rand, id: len(w.open) + 1, viewers: w.list,
		send: func(to int, m map[string]any) {
			if _, err := json.Marshal(m); err != nil {
				w.t.Fatalf("%s sent what doesn't encode: %v (%v)", kind.Name, err, m)
			}
		}}
	app.act = kind.New(app.room)
	if k, ok := app.act.(Keeper); ok {
		if b, ok := w.shelf.Load(kind.Name); ok {
			if err := k.Load(b); err != nil {
				w.t.Fatalf("%s won't load what it kept: %v\n%s", kind.Name, err, b)
			}
		}
	}
	return app
}

// keep: a Keeper's Save, loaded into a new one, saves the same again
func (w *walker) keep(app *running) {
	k, ok := app.act.(Keeper)
	if !ok {
		return
	}
	b, err := json.Marshal(k.Save())
	if err != nil {
		w.t.Fatalf("%s keeps what doesn't encode: %v", app.kind.Name, err)
	}
	again := app.kind.New(app.room).(Keeper)
	if err := again.Load(b); err != nil {
		w.t.Fatalf("%s won't load what it kept: %v\n%s", app.kind.Name, err, b)
	}
	if b2, _ := json.Marshal(again.Save()); string(b2) != string(b) {
		w.t.Fatalf("%s kept, loaded and kept again isn't the same:\n%s\n%s", app.kind.Name, b, b2)
	}
	w.shelf.Save(app.kind.Name, b)
}

// private: what one viewer mustn't see of another's
func (w *walker) private(app *running, what string) {
	w.t.Helper()
	switch a := app.act.(type) {
	case *call:
		for _, v := range w.viewers {
			j, _ := json.Marshal(a.View(v))
			for id, c := range a.in {
				if id != v.ID && strings.Contains(string(j), c.secret) {
					w.t.Fatalf("call, after %s: %d sees %d's secret", what, v.ID, id)
				}
			}
		}
	case *spies:
		for _, v := range w.viewers {
			view := a.View(v).(map[string]any)
			cards, _ := view["cards"].([]spyCard)
			if master, _ := view["master"].(bool); master || a.phase == "over" {
				continue
			}
			for _, c := range cards {
				if !c.Revealed && c.Color != "" {
					w.t.Fatalf("spies, after %s: %d, not a spymaster, sees the key", what, v.ID)
				}
			}
		}
	case *werewolf:
		if a.phase == "lobby" || a.phase == "over" {
			return
		}
		for _, v := range w.viewers {
			players, _ := a.View(v).(map[string]any)["players"].([]map[string]any)
			for i, p := range a.lobby.Players.List() {
				if i >= len(players) || players[i]["role"] == nil || !a.alive[p.ID] || p.ID == v.ID {
					continue
				}
				mine, theirs := a.role[v.ID], a.role[p.ID]
				_, seen := a.seen[p.ID]
				if !(mine == "wolf" && theirs == "wolf") && !(mine == "seer" && seen) {
					w.t.Fatalf("werewolf, after %s: %d (%s) sees %d is a %s", what, v.ID, mine, p.ID, theirs)
				}
			}
		}
	}
}

// walk: the fuzzer's bytes, as one session's goings-on
func walk(t *testing.T, data []byte) {
	b := &input{b: data}
	shelf := &MemShelf{}
	w := &walker{t: t, b: b, shelf: shelf, movie: &testMovie{pos: 10, lines: []Line{{1, 2, "the cat sat on the mat"}, {30, 32, "a dog and a cat"}}},
		reel: NewReel(shelf), now: time.Now(), // the apps' timers are set from the clock
		rand: rand.New(rand.NewPCG(1, 2))}
	if len(data) > 0 {
		w.rand = rand.New(rand.NewPCG(uint64(data[0]), uint64(len(data))))
	}
	for step := 0; step < 400 && !b.done(); step++ {
		// mostly playing: people and apps come and go now and then, as in a party
		op := b.n(100)
		switch {
		case op < 6:
			op = 0
		case op < 13:
			op = 1
		case op < 16:
			op = 2
		case op < 21:
			op = 3
		case op < 24:
			op = 4
		case op < 38:
			op = 5
		default:
			op = 6
		}
		switch op {
		case 0: // a page arrives
			if len(w.viewers) < 7 {
				w.lastID++
				v := Viewer{ID: w.lastID}
				w.viewers = append(w.viewers, v)
				for _, app := range w.open {
					w.call(app, "a page arriving", func() { app.act.Joined(app.room, v); app.room.Changed() })
				}
			}
		case 1: // someone takes a name, or another
			if len(w.viewers) > 0 {
				i := b.n(len(w.viewers))
				w.viewers[i].Name = strings.TrimSpace(names[b.n(len(names))])
				v := w.viewers[i]
				for _, app := range w.open {
					w.call(app, "a name", func() { app.act.Joined(app.room, v); app.room.Changed() })
				}
			}
		case 2: // a page goes
			if len(w.viewers) > 0 {
				i := b.n(len(w.viewers))
				v := w.viewers[i]
				w.viewers = slices.Delete(w.viewers, i, i+1)
				for _, app := range w.open {
					w.call(app, "a page going", func() { app.act.Left(app.room, v) })
				}
			}
		case 3: // an app opens
			if len(w.open) < 3 {
				w.open = append(w.open, w.start(Kinds[b.n(len(Kinds))]))
			}
		case 4: // one closes: kept, if it keeps
			if len(w.open) > 0 {
				i := b.n(len(w.open))
				w.keep(w.open[i])
				w.open = slices.Delete(w.open, i, i+1)
			}
		case 5: // time passes: a tick, or a long wait
			w.now = w.now.Add([]time.Duration{250 * time.Millisecond, time.Second, 10 * time.Second, 2 * time.Minute}[b.n(4)])
			w.movie.pos += float64(b.n(40))
			for _, app := range w.open {
				w.call(app, "a tick", func() { app.act.Tick(app.room, w.now) })
			}
		default: // someone does something in an app
			if len(w.open) > 0 && len(w.viewers) > 0 {
				app := w.open[b.n(len(w.open))]
				v := w.viewers[b.n(len(w.viewers))]
				if named := slices.DeleteFunc(w.list(), func(v Viewer) bool { return v.Name == "" }); len(named) > 0 && b.n(5) != 0 {
					v = named[b.n(len(named))] // mostly someone who can play
				}
				m := message(b, Commands[app.kind.Name])
				w.call(app, fmt.Sprintf("%s's %v", v.Name, m["kind"]), func() { app.act.Message(app.room, v, m) })
			}
		}
	}
	for _, app := range w.open {
		w.keep(app)
	}
}

// seeds: a few sessions, so plain `go test` walks a good part of the graph
func seeds() [][]byte {
	r := rand.New(rand.NewPCG(7, 7))
	var out [][]byte
	for i := range 24 {
		b := make([]byte, 400+i*40)
		for j := range b {
			b[j] = byte(r.IntN(256))
		}
		// open the app this seed is about, with four named people in it
		k := byte(i % len(Kinds))
		b = append([]byte{0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 2, 1, 2, 1, 3, 1, 3, 3, k}, b...)
		out = append(out, b)
	}
	return out
}

func FuzzApps(f *testing.F) {
	for _, s := range seeds() {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > 2048 { // a long session says no more than a few short ones, and shrinks slowly
			return
		}
		walk(t, data)
	})
}

// Every app is in the graph, and the graph has each message its script sends
// (its Out type, apps/<name>.ts): a message added to a script and not here fails
func TestCommandsAreTheScripts(t *testing.T) {
	ts := func(name string) string {
		b, err := os.ReadFile(filepath.Join("..", "web", "viewer", "apps", name+".ts"))
		if err != nil {
			t.Fatal(err)
		}
		return string(b)
	}
	kindsIn := func(src string) []string { // the kinds in `type X = ...;`, and the lobby's and strokes' if it uses them
		var out []string
		for _, m := range regexp.MustCompile(`kind: ((?:'[a-z_]+'(?: \| )?)+)`).FindAllStringSubmatch(src, -1) {
			for _, k := range regexp.MustCompile(`'([a-z_]+)'`).FindAllStringSubmatch(m[1], -1) {
				out = append(out, k[1])
			}
		}
		return out
	}
	lib := ts("lib")
	lobby := kindsIn(regexp.MustCompile(`type LobbyMsg = [^;]*;`).FindString(lib))
	stroke := kindsIn(regexp.MustCompile(`type StrokeMsg = [^;]*;`).FindString(lib))
	for _, k := range Kinds {
		cmds, ok := Commands[k.Name]
		if !ok {
			t.Errorf("%s isn't in Commands", k.Name)
			continue
		}
		var want []string
		src := ts(k.Script())
		if out := regexp.MustCompile(`(?s)type Out = .*?;\n`).FindString(src); out != "" {
			want = kindsIn(out)
			if strings.Contains(out, "LobbyMsg") {
				want = append(want, lobby...)
			}
			if strings.Contains(out, "StrokeMsg") {
				want = append(want, stroke...)
			}
		} else if strings.Contains(src, "L.sketch(") || strings.Contains(src, "sketch(ctx") {
			want = stroke // Graffiti: only the strokes lib.sketch sends
		}
		var have []string
		for _, c := range cmds {
			have = append(have, c.Kind)
		}
		sort.Strings(want)
		sort.Strings(have)
		want, have = slices.Compact(want), slices.Compact(have)
		if !slices.Equal(want, have) {
			t.Errorf("%s: its script sends %v, Commands has %v", k.Name, want, have)
		}
	}
	for name := range Commands {
		if _, ok := Lookup(name); !ok {
			t.Errorf("Commands has %s, which isn't an app", name)
		}
	}
}
