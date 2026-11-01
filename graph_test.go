package main

// The command graph: everything that can be done to Mouse Party, written down
// as data, and walked by fuzzers that check, after every step, what must always
// hold. Three layers:
//
//   - the Mac window: App's methods, in each state App.state names (windowGraph)
//   - the viewers' sockets: what a page says to the host (socketGraph)
//   - the apps: what a page says to each app (apps.Commands)
//
// Tests check the graph against the code (every App method, every message in
// web/viewer/types.ts and in each app's script), so a command can't be added
// without it; docs/commands.md is drawn from it (UPDATE_GRAPH=1 go test -run
// TestCommandGraphDoc writes it; a stale one fails). `go test` runs the fuzzers'
// seeds; scripts/fuzz.sh searches further, and keeps what fails in testdata/fuzz.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/ftrain/mouseparty/apps"
	"github.com/gorilla/websocket"
)

// ---------- the graph ----------

// windowStates: what App.state says the app is doing
var windowStates = []string{"empty", "linking", "nolink", "ready", "countdown", "movie", "doc", "between", "stopping"}

// windowCommand: one of App's methods. In a state it Acts in, it can leave the
// app in any of To[that state] ("same": where it was); in any other, it changes nothing.
type windowCommand struct {
	Name string
	Acts []string
	To   map[string][]string
	Note string
}

var (
	playing  = []string{"countdown", "movie", "doc", "between"}
	stopped  = []string{"stopping", "ready", "nolink", "linking", "empty"}
	starting = []string{"countdown", "movie", "doc", "ready"} // ready: nothing further down can play
)

func each(states []string, to ...string) map[string][]string {
	m := map[string][]string{}
	for _, s := range states {
		m[s] = to
	}
	return m
}

func merge(ms ...map[string][]string) map[string][]string {
	out := map[string][]string{}
	for _, m := range ms {
		for k, v := range m {
			out[k] = v
		}
	}
	return out
}

var windowGraph = []windowCommand{
	{"PlayClicked", append([]string{"ready"}, playing...), merge(each([]string{"ready"}, starting...), each(playing, stopped...)),
		"Play, or Stop"},
	{"PlayRow", append([]string{"ready"}, playing...), merge(each([]string{"ready"}, starting...), each([]string{"countdown", "movie", "doc"}, "same", "between"),
		each([]string{"between"}, "between")), "a row double-clicked: play it, or switch to it"},
	{"Seek", []string{"movie"}, each([]string{"movie"}, "movie", "between"), "the slider let go"},
	{"ShowPage", []string{"doc"}, each([]string{"doc"}, "doc"), "a PDF's page, from the slider"},
	{"TurnPage", []string{"doc"}, each([]string{"doc"}, "doc", "between", "stopping", "ready"), "the arrow keys; past the last page, on"},
	{"Select", windowStates, each(windowStates, "same"), "a row clicked"},
	{"Move", windowStates, each(windowStates, "same"), "a row dragged"},
	{"Remove", windowStates, each(windowStates, "same", "empty", "stopping", "between"), "Backspace: the selected row"},
	{"LinkClicked", windowStates, merge(each(windowStates, "same"), each([]string{"nolink"}, "linking", "nolink")), "copy the link, or try again for one"},
	{"SetSettingsText", windowStates, nil, "Party > Settings: the settings and the list, as JSON (off the app's goroutine; while playing it says Stop first)"},
	{"AddPaths", windowStates, nil, "files dropped (off the app's goroutine: no immediate state)"},
}

// windowElsewhere: App methods that aren't walked here, and where they're tested
var windowElsewhere = map[string]string{
	"GetView":      "a question, not a command: every step reads the view",
	"Unlock":       "the sealed party (store_test.go): Argon2 is too slow to fuzz",
	"StartOver":    "the sealed party (store_test.go)",
	"SetPasscode":  "the sealed party (store_test.go)",
	"SettingsText": "a question: SetSettingsText is walked",
}

// socketCommand: what a viewer's page says on its socket (chat.go), and its fields
type socketCommand struct {
	Type   string
	Fields []apps.Field
	Note   string
}

var socketGraph = []socketCommand{
	{"join", []apps.Field{{Name: "name", Type: "str", Max: nameMax}}, "take a name (or another)"},
	{"say", []apps.Field{{Name: "text", Type: "str", Max: textMax}}, "a line of chat"},
	{"app_open", []apps.Field{{Name: "name", Type: "app"}}, "open an app for everyone"},
	{"app_close", []apps.Field{{Name: "id", Type: "appid"}}, "close one for everyone"},
	{"doc_at", []apps.Field{{Name: "token", Type: "str", Max: 20}, {Name: "at", Type: "str", Max: 80}, {Name: "back", Type: "bool"}}, "a page of the database up"},
	{"app", []apps.Field{{Name: "id", Type: "appid"}}, "a message for an app: its kind and fields are apps.Commands"},
}

// fromHost: the types the host sends a page (types.ts FromHost)
var fromHost = []string{"hello", "apps", "app", "doc", "subs", "schedule", "clock", "online", "msg", "system"}

// ---------- the graph is the code's ----------

// Every App method is in the graph, or says where else it's tested
func TestWindowGraphIsApp(t *testing.T) {
	methods := map[string]bool{}
	ty := reflect.TypeFor[*App]()
	for i := range ty.NumMethod() {
		methods[ty.Method(i).Name] = true
	}
	for _, c := range windowGraph {
		if !methods[c.Name] {
			t.Errorf("the graph has %s, which App hasn't", c.Name)
		}
		delete(methods, c.Name)
		for from, to := range c.To {
			if !slices.Contains(windowStates, from) {
				t.Errorf("%s: %s isn't a state", c.Name, from)
			}
			for _, s := range to {
				if s != "same" && !slices.Contains(windowStates, s) {
					t.Errorf("%s: %s isn't a state", c.Name, s)
				}
			}
		}
	}
	for name := range windowElsewhere {
		delete(methods, name)
	}
	for name := range methods {
		t.Errorf("App.%s isn't in the command graph (windowGraph), nor windowElsewhere", name)
	}
	// and the states are App.state's: each is a string it returns
	src, _ := os.ReadFile("app.go")
	for _, s := range windowStates {
		if !strings.Contains(string(src), `return "`+s+`"`) && !strings.Contains(string(src), `"`+s+`"`) {
			t.Errorf("app.go never says %q", s)
		}
	}
}

// What a page sends and is sent are the graph's (web/viewer/types.ts)
func TestSocketGraphIsTypes(t *testing.T) {
	src, err := os.ReadFile("web/viewer/types.ts")
	if err != nil {
		t.Fatal(err)
	}
	union := func(name string) []string {
		block := regexp.MustCompile(`(?s)export type ` + name + ` =(.*?);\n\n`).FindStringSubmatch(string(src))
		if block == nil {
			t.Fatalf("no %s in types.ts", name)
		}
		var out []string
		for _, m := range regexp.MustCompile(`type: '([a-z_]+)'`).FindAllStringSubmatch(block[1], -1) {
			out = append(out, m[1])
		}
		return out
	}
	var have []string
	for _, c := range socketGraph {
		have = append(have, c.Type)
	}
	if want := union("ToHost"); !sameSet(want, have) {
		t.Errorf("a page sends %v (types.ts ToHost); socketGraph has %v", want, have)
	}
	// FromHost names some by interface (ChatLine, Subs, ...): those types are checked as they arrive (FuzzSocket)
	for _, k := range union("FromHost") {
		if !slices.Contains(fromHost, k) {
			t.Errorf("types.ts FromHost has %q; fromHost hasn't", k)
		}
	}
	chat, _ := os.ReadFile("chat.go")
	for _, c := range socketGraph {
		if !strings.Contains(string(chat), `"`+c.Type+`"`) {
			t.Errorf("chat.go doesn't read %q", c.Type)
		}
	}
}

func sameSet(a, b []string) bool {
	a, b = slices.Clone(a), slices.Clone(b)
	sort.Strings(a)
	sort.Strings(b)
	return slices.Equal(slices.Compact(a), slices.Compact(b))
}

// docs/commands.md is drawn from the graph: UPDATE_GRAPH=1 writes it
func TestCommandGraphDoc(t *testing.T) {
	var b strings.Builder
	b.WriteString("# The command graph\n\nEverything that can be done to Mouse Party, as the fuzzers walk it. Drawn from\n" +
		"`graph_test.go` (`windowGraph`, `socketGraph`) and `apps/commands.go` (`apps.Commands`) by\n" +
		"`UPDATE_GRAPH=1 go test -run TestCommandGraphDoc .`; `go test` fails while it's stale. How it's tested: `docs/testing.md`.\n\n")
	b.WriteString("## The Mac window\n\nIts states are `App.state`'s; each command acts only in the states it leads from, and changes nothing in any other.\n\n```mermaid\nstateDiagram-v2\n")
	type arrow struct{ from, to string }
	labels := map[arrow][]string{}
	for _, c := range windowGraph {
		for _, from := range windowStates {
			for _, to := range c.To[from] {
				if to == "same" || to == from {
					continue
				}
				labels[arrow{from, to}] = append(labels[arrow{from, to}], c.Name)
			}
		}
	}
	var arrows []arrow
	for a := range labels {
		arrows = append(arrows, a)
	}
	sort.Slice(arrows, func(i, j int) bool {
		return slices.Index(windowStates, arrows[i].from)*100+slices.Index(windowStates, arrows[i].to) <
			slices.Index(windowStates, arrows[j].from)*100+slices.Index(windowStates, arrows[j].to)
	})
	for _, a := range arrows {
		fmt.Fprintf(&b, "    %s --> %s: %s\n", a.from, a.to, strings.Join(labels[a], ", "))
	}
	b.WriteString("```\n\nBesides those, the app moves on its own (the link made, a countdown over, a movie ended, a file gone).\n\n")
	b.WriteString("| Command | What it is | Acts in |\n|---|---|---|\n")
	for _, c := range windowGraph {
		acts := strings.Join(c.Acts, ", ")
		if len(c.Acts) == len(windowStates) {
			acts = "every state"
		}
		fmt.Fprintf(&b, "| `%s` | %s | %s |\n", c.Name, c.Note, acts)
	}
	var elsewhere []string
	for name := range windowElsewhere {
		elsewhere = append(elsewhere, name)
	}
	sort.Strings(elsewhere)
	b.WriteString("\nNot walked: ")
	for i, name := range elsewhere {
		if i > 0 {
			b.WriteString("; ")
		}
		fmt.Fprintf(&b, "`%s`, %s", name, windowElsewhere[name])
	}
	b.WriteString(".\n\n## A viewer's page, on its socket\n\n| Type | Fields | What it is |\n|---|---|---|\n")
	fields := func(fs []apps.Field) string {
		var out []string
		for _, f := range fs {
			out = append(out, fmt.Sprintf("`%s` (%s)", f.Name, f.Type))
		}
		return strings.Join(out, ", ")
	}
	for _, c := range socketGraph {
		fmt.Fprintf(&b, "| `%s` | %s | %s |\n", c.Type, fields(c.Fields), c.Note)
	}
	b.WriteString("\n## The apps\n\nWhat a page sends each app, as `{\"type\": \"app\", \"id\", \"kind\", ...}`.\n\n| App | Kind | Fields |\n|---|---|---|\n")
	for _, k := range apps.Kinds {
		cmds := apps.Commands[k.Name]
		if len(cmds) == 0 {
			fmt.Fprintf(&b, "| %s | (none) | |\n", k.Title)
		}
		for i, c := range cmds {
			title := k.Title
			if i > 0 {
				title = ""
			}
			fmt.Fprintf(&b, "| %s | `%s` | %s |\n", title, c.Kind, fields(c.Fields))
		}
	}
	doc := b.String()
	if os.Getenv("UPDATE_GRAPH") != "" {
		if err := os.WriteFile("docs/commands.md", []byte(doc), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	if have, _ := os.ReadFile("docs/commands.md"); string(have) != doc {
		t.Error("docs/commands.md is stale: UPDATE_GRAPH=1 go test -run TestCommandGraphDoc .")
	}
}

// ---------- the viewers' sockets, fuzzed ----------

// choices: the fuzzer's bytes, read as choices; used up, the walk ends
type choices struct {
	b []byte
	i int
}

func (c *choices) done() bool { return c.i >= len(c.b) }
func (c *choices) n(k int) int {
	if c.done() || k <= 1 {
		c.i++
		return 0
	}
	v := int(c.b[c.i])
	c.i++
	return v % k
}

var socketTexts = []string{"", "hi", "Ann", " Bob ", strings.Repeat("é", 600), "\u0000‮", "😀😀", "<script>x</script>", "/"}

// socketValue: a field's value, sometimes the wrong kind of thing
func socketValue(c *choices, f apps.Field, ids []float64) any {
	if c.n(5) == 0 {
		return []any{nil, true, 3.5, -1.0, 1e300, "x", []any{1.0}, map[string]any{"a": 1.0}}[c.n(8)]
	}
	switch f.Type {
	case "str":
		return socketTexts[c.n(len(socketTexts))]
	case "bool":
		return c.n(2) == 1
	case "app":
		if c.n(8) == 0 {
			return "nope"
		}
		return apps.Kinds[c.n(len(apps.Kinds))].Name
	case "appid":
		if len(ids) == 0 || c.n(6) == 0 {
			return float64(c.n(20))
		}
		return ids[c.n(len(ids))]
	}
	return nil
}

// appMessage: one of an app's commands, from the apps' graph (fields as its fuzzer makes them, simpler)
func appMessage(c *choices, name string) map[string]any {
	cmds := apps.Commands[name]
	m := map[string]any{}
	if len(cmds) == 0 || c.n(8) == 0 {
		m["kind"] = "nope"
		return m
	}
	cmd := cmds[c.n(len(cmds))]
	m["kind"] = cmd.Kind
	for _, f := range cmd.Fields {
		switch f.Type {
		case "int", "num":
			m[f.Name] = f.Lo + float64(c.n(int(f.Hi-f.Lo)+1))
		case "bool":
			m[f.Name] = c.n(2) == 1
		case "str", "ops":
			m[f.Name] = socketTexts[c.n(len(socketTexts))]
		case "points":
			m[f.Name] = []any{[]any{0.1, 0.2}, []any{0.5, 0.5}}
		default:
			m[f.Name] = []any{}
		}
	}
	return m
}

// a page in the walk: its socket, and everything it's been sent
type page struct {
	ws     *websocket.Conn
	mu     sync.Mutex
	got    []map[string]any
	closed chan struct{}
}

func (p *page) read() {
	defer close(p.closed)
	for {
		_, b, err := p.ws.ReadMessage()
		if err != nil {
			return
		}
		var m map[string]any
		if json.Unmarshal(b, &m) != nil {
			m = map[string]any{"type": "NOT JSON: " + string(b)}
		}
		p.mu.Lock()
		p.got = append(p.got, m)
		p.mu.Unlock()
	}
}

// socketWalk: the fuzzer's bytes as pages coming and going and saying things, over real sockets
func socketWalk(t *testing.T, data []byte) {
	h := &Host{}
	h.chat = &Chat{conns: map[*chatConn]bool{}}
	h.apps = newAppHost(h.chat, apps.Env{Movie: h, Shelf: &apps.MemShelf{}})
	h.chat.hello = h.greeting
	h.chat.app, h.chat.appControl = h.apps.message, h.apps.control
	h.chat.joined, h.chat.left = h.apps.joined, h.apps.left
	srv := httptest.NewServer(http.HandlerFunc(h.chat.handle))
	defer srv.Close()
	defer h.apps.closeAll()
	url := "ws" + strings.TrimPrefix(srv.URL, "http")
	dial := func() *page {
		ws, _, err := websocket.DefaultDialer.Dial(url, nil)
		if err != nil {
			t.Fatalf("the host stopped answering: %v", err)
		}
		p := &page{ws: ws, closed: make(chan struct{})}
		go p.read()
		return p
	}
	var pages, all []*page
	defer func() {
		for _, p := range all {
			p.ws.Close()
		}
	}()
	c := &choices{b: data}
	var slept time.Duration
	for step := 0; step < 200 && !c.done(); step++ {
		switch op := c.n(20); {
		case op == 0 && len(pages) < 5:
			p := dial()
			pages, all = append(pages, p), append(all, p)
		case op == 1 && len(pages) > 0:
			i := c.n(len(pages))
			pages[i].ws.Close()
			pages = slices.Delete(pages, i, i+1)
		case op == 2 && len(pages) > 0: // not JSON, or a binary frame
			pages[c.n(len(pages))].ws.WriteMessage([]int{websocket.TextMessage, websocket.BinaryMessage}[c.n(2)],
				[][]byte{[]byte("{"), []byte(`"x"`), []byte(`[1,2]`), []byte(`{"type":7}`), {0xff, 0xfe}, []byte(`null`)}[c.n(6)])
		case op == 3: // past the once-a-second limits; three seconds a walk at most, or a walk of waits is a hang
			if d := time.Duration(c.n(4)) * 300 * time.Millisecond; slept+d <= 3*time.Second {
				time.Sleep(d)
				slept += d
			}
		default:
			if len(pages) == 0 {
				p := dial()
				pages, all = append(pages, p), append(all, p)
			}
			p := pages[c.n(len(pages))]
			var ids []float64
			for _, s := range h.apps.sessions() {
				ids = append(ids, float64(s.ID))
			}
			cmd := socketGraph[c.n(len(socketGraph))]
			m := map[string]any{"type": cmd.Type}
			for _, f := range cmd.Fields {
				if c.n(10) != 0 {
					m[f.Name] = socketValue(c, f, ids)
				}
			}
			if cmd.Type == "app" {
				name := apps.Kinds[c.n(len(apps.Kinds))].Name
				if id, ok := m["id"].(float64); ok {
					for _, s := range h.apps.sessions() {
						if float64(s.ID) == id {
							name = s.Kind.Name
						}
					}
				}
				for k, v := range appMessage(c, name) {
					m[k] = v
				}
			}
			if err := p.ws.WriteJSON(m); err != nil {
				pages = slices.DeleteFunc(pages, func(q *page) bool { return q == p })
			}
		}
		if n := len(h.apps.sessions()); n > appsMax {
			t.Fatalf("%d apps open, more than %d", n, appsMax)
		}
	}
	// still answering, and what every page was sent is as types.ts says
	last := dial()
	all = append(all, last)
	for end := time.Now().Add(3 * time.Second); ; time.Sleep(10 * time.Millisecond) {
		last.mu.Lock()
		n := len(last.got)
		last.mu.Unlock()
		if n > 0 {
			break
		}
		if time.Now().After(end) {
			t.Fatal("a new page got no hello")
		}
	}
	time.Sleep(30 * time.Millisecond)
	secrets := map[string]*page{}
	for _, p := range all {
		p.mu.Lock()
		for _, m := range p.got {
			kind, _ := m["type"].(string)
			if !slices.Contains(fromHost, kind) {
				t.Fatalf("a page was sent a %q: %v", kind, m)
			}
			switch kind {
			case "msg", "system":
				if text, _ := m["text"].(string); kind == "msg" && utf8.RuneCountInString(text) > textMax {
					t.Fatalf("a line longer than %d", textMax)
				}
				if name, _ := m["name"].(string); utf8.RuneCountInString(name) > nameMax {
					t.Fatalf("a name longer than %d", nameMax)
				}
			case "app": // a call's secret goes to one page only
				if view, _ := m["view"].(map[string]any); view != nil {
					if s, _ := view["secret"].(string); s != "" {
						if other := secrets[s]; other != nil && other != p {
							t.Fatal("two pages were sent the same call secret")
						}
						secrets[s] = p
					}
				}
			}
		}
		p.mu.Unlock()
	}
}

func FuzzSocket(f *testing.F) {
	r := rand.New(rand.NewPCG(5, 5))
	for i := range 6 {
		b := []byte{0, 0, 0} // three pages
		for range 150 + 40*i {
			b = append(b, byte(r.IntN(256)))
		}
		f.Add(b)
	}
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > 1024 {
			return
		}
		socketWalk(t, data)
	})
}

// ---------- the Mac window, fuzzed ----------

// windowFiles: what can be dropped on the list, made once: two short clips, a
// song, a two-page PDF, a file that isn't anything, and one that isn't there
var windowFiles struct {
	once  sync.Once
	dir   string
	paths map[string]string
	err   error
}

func makeWindowFiles() (map[string]string, error) {
	w := &windowFiles
	w.once.Do(func() {
		w.dir, w.err = os.MkdirTemp("", "mouseparty-fuzz-")
		if w.err != nil {
			return
		}
		ff := findTool("ffmpeg")
		p := func(name string) string { return filepath.Join(w.dir, name) }
		w.paths = map[string]string{"clip": p("First.Clip.2026.mkv"), "clip2": p("Second.Clip.mkv"), "song": p("Song.mka"),
			"pdf": p("Reading.pdf"), "junk": p("tool.exe"), "gone": p("Gone.Clip.mkv")}
		for _, c := range [][]string{
			{"-f", "lavfi", "-i", "testsrc=s=320x240:r=30:d=3", "-f", "lavfi", "-i", "sine=f=440:d=3", "-c:v", "libx264", "-c:a", "libopus", w.paths["clip"]},
			{"-f", "lavfi", "-i", "testsrc=s=320x240:r=30:d=2", "-f", "lavfi", "-i", "sine=f=660:d=2", "-c:v", "libx264", "-c:a", "libopus", w.paths["clip2"]},
			{"-f", "lavfi", "-i", "sine=f=330:d=2", "-c:a", "libopus", "-f", "matroska", w.paths["song"]},
		} {
			if out, err := exec.Command(ff, append([]string{"-v", "error", "-y"}, c...)...).CombinedOutput(); err != nil {
				w.err = fmt.Errorf("%v: %s", err, out)
				return
			}
		}
		os.WriteFile(w.paths["pdf"], twoPagePDF(), 0o644)
		os.WriteFile(w.paths["junk"], []byte("MZ"), 0o644)
	})
	return w.paths, w.err
}

// twoPagePDF: the smallest PDF with two pages, its cross-reference table counted out
func twoPagePDF() []byte {
	objs := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
	}
	var b bytes.Buffer
	b.WriteString("%PDF-1.4\n")
	var offs []int
	for i, o := range objs {
		offs = append(offs, b.Len())
		fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", i+1, o)
	}
	xref := b.Len()
	fmt.Fprintf(&b, "xref\n0 %d\n0000000000 65535 f \n", len(objs)+1)
	for _, o := range offs {
		fmt.Fprintf(&b, "%010d 00000 n \n", o)
	}
	fmt.Fprintf(&b, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objs)+1, xref)
	return b.Bytes()
}

var settingsTexts = []string{`{"countdown": 1}`, `{"countdown": 0, "queue": [{"path": "/nowhere.mkv"}], "position": 9}`,
	`{"countdown": -5, "skip": 3}`, `not json`, `{}`, `[]`, `{"countdown": 1e308}`, `{"bitrate": "x"}`,
	`{"countdown": 1, "queue": [{"path": "/nowhere.pdf", "kind": "pdf", "pages": -3, "page": 99}, {"path": "", "duration": -1}], "position": -4}`}

// checkView: what every view must say, whatever happened
func checkView(t *testing.T, what, state string, v View) {
	t.Helper()
	fail := func(why string) { t.Fatalf("after %s, in %s: %s\n%+v", what, state, why, v) }
	if !slices.Contains(windowStates, state) {
		fail("not a state")
	}
	playingNow := slices.Contains(playing, state)
	if (v.Play == "stop") != playingNow {
		fail("the big button says " + v.Play)
	}
	if v.PlayOn != (playingNow || state == "ready") {
		fail(fmt.Sprintf("Play is pressable: %v", v.PlayOn))
	}
	if v.Selected < -1 || v.Selected >= len(v.Rows) {
		fail(fmt.Sprintf("row %d selected of %d", v.Selected, len(v.Rows)))
	}
	now := 0
	for i, r := range v.Rows {
		if r.Now {
			now++
		}
		if r.Played && i > 0 && !v.Rows[i-1].Played {
			fail("a row played after one that isn't")
		}
	}
	if now > 1 || (now == 1 && !playingNow) {
		fail(fmt.Sprintf("%d rows playing", now))
	}
	if v.Slider.Min > v.Slider.Max || (v.Slider.On && state != "movie" && state != "doc") {
		fail("the slider")
	}
	if state == "empty" && (len(v.Rows) != 0 || v.PlayOn) {
		fail("empty, with rows or Play")
	}
}

// windowWalk: the fuzzer's bytes as someone at the Mac: dropping files, pressing
// things, double-clicking, dragging, waiting, a drive unplugged and plugged back in
func windowWalk(t *testing.T, data []byte) {
	files, err := makeWindowFiles()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", t.TempDir()) // never the real party file
	a := NewApp(standby)
	a.hostSetup = func(h *Host) {
		h.HTTPPort, h.ICEPort, h.MapPorts, h.CleanLeftovers, h.Cloudflared = freePort(), freeICEPort(), false, false, ""
	}
	go a.run()
	go a.watchFiles()
	defer a.shutdown(nil)
	a.wait(func() { a.cfg.Countdown = 1 })
	c := &choices{b: data}
	kinds := []string{"clip", "clip2", "song", "pdf", "junk", "gone"}
	// look: the state and the view, together, from the app's goroutine. Checks
	// run here, after: a test that fails on the app's goroutine would end it,
	// and leave the test waiting for it for ever.
	look := func() (state string, v View) {
		a.wait(func() { state, v = a.state(), a.view() })
		return
	}
	// still: the view as it is when nothing happens (the playhead moves with the clock)
	still := func(v View) string {
		v.Slider.Value, v.Slider.Label = 0, ""
		b, _ := json.Marshal(v)
		return string(b)
	}
	step := func(name string, fn func(), acts []string, to map[string][]string) {
		t.Helper()
		var before, after string
		var bv, av View
		a.wait(func() { // the command between two looks, on the app's goroutine: nothing else happens meanwhile
			before, bv = a.state(), a.view()
			fn()
			after, av = a.state(), a.view()
		})
		seenEdges.Store(before+" --"+name+"--> "+after, true)
		checkView(t, name, after, av)
		if !slices.Contains(acts, before) {
			if before != after || still(bv) != still(av) {
				t.Fatalf("%s did something in %s, where it does nothing:\n%s\n%s", name, before, still(bv), still(av))
			}
			return
		}
		if to != nil && !slices.Contains(to[before], after) && !(after == before && slices.Contains(to[before], "same")) {
			t.Fatalf("%s took %s to %s; the graph says %v", name, before, after, to[before])
		}
	}
	command := func(name string) windowCommand {
		for _, c := range windowGraph {
			if c.Name == name {
				return c
			}
		}
		panic(name)
	}
	for i := 0; i < 30 && !c.done(); i++ {
		var rows int
		a.wait(func() { rows = len(a.cfg.Queue) })
		row := func() int { return c.n(rows+2) - 1 } // -1 and one past the end, too
		var name string
		var fn func()
		switch c.n(14) {
		case 0, 1: // files dropped
			var paths []string
			for range 1 + c.n(3) {
				paths = append(paths, files[kinds[c.n(len(kinds))]])
			}
			a.addPaths(paths, -1, row())
			continue
		case 2:
			name, fn = "PlayClicked", a.playClicked
		case 3:
			r := row()
			name, fn = "PlayRow", func() { a.playRow(r) }
		case 4:
			s := float64(c.n(5)) - 1
			name, fn = "Seek", func() { a.seek(s) }
		case 5:
			p := c.n(4)
			name, fn = "ShowPage", func() { a.showPage(p) }
		case 6:
			s := []int{1, -1, 5}[c.n(3)]
			name, fn = "TurnPage", func() { a.turnPage(s) }
		case 7:
			r := row()
			name, fn = "Select", func() { a.selectRow(r) }
		case 8:
			i, j := row(), row()
			name, fn = "Move", func() { a.move(i, j) }
		case 9:
			name, fn = "Remove", a.remove
		case 10:
			name, fn = "LinkClicked", a.linkClicked
		case 11:
			a.SetSettingsText(settingsTexts[c.n(len(settingsTexts))])
			state, v := look()
			checkView(t, "SetSettingsText", state, v)
			continue
		case 12: // a drive unplugged, or plugged back in
			if c.n(2) == 0 {
				os.Rename(files["clip2"], files["clip2"]+".away")
			} else {
				os.Rename(files["clip2"]+".away", files["clip2"])
			}
			continue
		default: // time passes: the app goes on by itself
			time.Sleep(time.Duration(1+c.n(8)) * 250 * time.Millisecond)
			state, v := look()
			checkView(t, "waiting", state, v)
			continue
		}
		cmd := command(name)
		step(name, fn, cmd.Acts, cmd.To)
	}
	os.Rename(files["clip2"]+".away", files["clip2"])
	// however it went, Stop settles it: nothing left playing, and nothing stuck
	a.wait(func() {
		if a.playing {
			a.playClicked()
		}
	})
	var state string
	for end := time.Now().Add(20 * time.Second); time.Now().Before(end); time.Sleep(100 * time.Millisecond) {
		a.wait(func() { state = a.state() })
		if state == "ready" || state == "empty" || state == "nolink" {
			return
		}
	}
	t.Fatalf("stopped, and still %s after 20 seconds", state)
}

// seenEdges: the transitions the walks took (go test -v lists them)
var seenEdges sync.Map

func FuzzWindow(f *testing.F) {
	if findTool("mediamtx") == "" || findTool("ffmpeg") == "" {
		f.Skip("needs mediamtx and ffmpeg")
	}
	f.Cleanup(func() {
		if testing.Verbose() {
			var edges []string
			seenEdges.Range(func(k, _ any) bool { edges = append(edges, k.(string)); return true })
			sort.Strings(edges)
			f.Logf("%d transitions taken:\n%s", len(edges), strings.Join(edges, "\n"))
		}
	})
	// drop everything, wait for the link, then play about; and the same with a drive gone
	f.Add([]byte{0, 2, 0, 1, 2, 3, 13, 7, 13, 7, 13, 7, 2, 13, 5, 13, 5, 4, 3, 13, 5, 3, 1, 13, 5, 2, 13, 6, 9, 7, 2, 13, 7})
	f.Add([]byte{0, 2, 3, 2, 13, 7, 13, 7, 7, 3, 3, 2, 13, 7, 13, 7, 6, 0, 13, 6, 0, 13, 6, 1, 13, 7, 2, 13, 7, 9, 9, 9, 9})
	f.Add([]byte{1, 2, 0, 1, 2, 13, 7, 13, 7, 12, 0, 2, 13, 7, 13, 7, 3, 1, 13, 4, 4, 2, 13, 7, 12, 1, 3, 2, 8, 0, 1, 11, 2, 10})
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > 64 {
			return
		}
		windowWalk(t, data)
	})
}
