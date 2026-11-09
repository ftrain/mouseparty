package apps

// Graffiti: everyone draws on the video. Lines are kept in the video's own
// coordinates (0-1 across and down the 16:9 picture), so they land on the same
// spot for every viewer whatever their window. Sketch draws the same way.
//
// Every minute someone drew, the page turns: the frame showing, with the wall
// on it, goes into the Graffiti Reel (reel.go), and the wall is clean again.
// What's on it meanwhile is kept, there again the next time Graffiti is up.

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"
)

// graffitiPage: how long a page of the wall lasts once someone draws on it
const graffitiPage = time.Minute

// the script's palette and pens (host_web/apps/lib.js), for the reel's pictures
var (
	graffitiPalette = []string{"#ff3b30", "#ffcc00", "#34c759", "#0a84ff", "#ffffff", "#000000"}
	graffitiPens    = []float64{3, 8, 20} // in a 720-line picture
)

const (
	graffitiColors    = 6     // the palette is the script's; a colour is its index
	graffitiWidths    = 3     // thin, medium, thick
	graffitiMaxPoints = 64    // in one message: a few frames of drawing
	graffitiMaxTotal  = 50000 // points in all; then the wall is full
)

// Stroke is a piece of a line: the page sends one every few frames while the
// pen is down, starting where the last left off. The pieces of one line share
// its ID, which the host gives it: erasing or undoing takes the whole line.
type Stroke struct {
	ID     int          `json:"i"`
	Color  int          `json:"c"`
	Width  int          `json:"w"`
	Points [][2]float64 `json:"p"`
	owner  int          // the viewer who drew it, this session (none once kept and loaded)
}

// ReadStroke: a stroke from a viewer's message, or false if it isn't a good one
func ReadStroke(m Msg) (Stroke, bool) {
	c, ok1 := m.Int("c", 0, graffitiColors-1)
	w, ok2 := m.Int("w", 0, graffitiWidths-1)
	p, ok3 := readPoints(m)
	if !ok1 || !ok2 || !ok3 {
		return Stroke{}, false
	}
	return Stroke{Color: c, Width: w, Points: p}, true
}

// readPoints: a message's "p", [[x, y], ...] in the picture's 0-1, or false
func readPoints(m Msg) ([][2]float64, bool) {
	raw, ok := m["p"].([]any)
	if !ok || len(raw) < 1 || len(raw) > graffitiMaxPoints {
		return nil, false
	}
	var out [][2]float64
	for _, p := range raw {
		xy, ok := p.([]any)
		if !ok || len(xy) != 2 {
			return nil, false
		}
		x, okx := xy[0].(float64)
		y, oky := xy[1].(float64)
		if !okx || !oky || x != x || y != y {
			return nil, false
		}
		out = append(out, [2]float64{min(max(x, 0), 1), min(max(y, 0), 1)})
	}
	return out, true
}

// wall: the lines drawn on Graffiti or a Sketch pad, and what can be done to them:
// draw, rub out with the eraser, take back your own last line, wipe it clean
type wall struct {
	lines  []Stroke
	points int
	next   int            // the next line's ID
	open   map[int][2]int // each viewer's line being drawn: its number on their page, its ID
}

// draw adds a piece of a line from a viewer's "line" message, false if it isn't one or the wall is full.
// "n" is the page's own number for the line, the same in each of its pieces.
func (w *wall) draw(from Viewer, m Msg) (Stroke, bool) {
	l, ok := ReadStroke(m)
	if !ok || len(l.Points) < 2 || w.points+len(l.Points) > graffitiMaxTotal {
		return Stroke{}, false
	}
	n, more := m.Int("n", 1, 1<<30)
	if w.open == nil {
		w.open = map[int][2]int{}
	}
	if o, ok := w.open[from.ID]; more && ok && o[0] == n && w.has(o[1]) {
		l.ID = o[1]
	} else {
		w.next++
		l.ID = w.next
		if more {
			w.open[from.ID] = [2]int{n, l.ID}
		}
	}
	l.owner = from.ID
	w.lines = append(w.lines, l)
	w.points += len(l.Points)
	return l, true
}

func (w *wall) has(id int) bool {
	return slices.ContainsFunc(w.lines, func(l Stroke) bool { return l.ID == id })
}

// remove takes out every piece of these lines
func (w *wall) remove(ids []int) {
	w.lines = slices.DeleteFunc(w.lines, func(l Stroke) bool { return slices.Contains(ids, l.ID) })
	w.points = 0
	for _, l := range w.lines {
		w.points += len(l.Points)
	}
}

// eraserSize: how near the eraser's middle a line is rubbed out, in the picture's
// height (a fat pen's width), plus the line's own half width
const eraserSize = 12.0 / 720

// erase rubs out every line the eraser's path touches, and says which
func (w *wall) erase(m Msg) []int {
	path, ok := readPoints(m)
	if !ok {
		return nil
	}
	const aspect = 16.0 / 9                            // a step across is longer than one down
	near := func(p, a, b [2]float64, r float64) bool { // p within r of the segment a-b
		px, py, ax, ay, bx, by := p[0]*aspect, p[1], a[0]*aspect, a[1], b[0]*aspect, b[1]
		dx, dy := bx-ax, by-ay
		t := 0.0
		if d := dx*dx + dy*dy; d > 0 {
			t = min(max(((px-ax)*dx+(py-ay)*dy)/d, 0), 1)
		}
		ex, ey := ax+t*dx-px, ay+t*dy-py
		return ex*ex+ey*ey <= r*r
	}
	lo, hi := path[0], path[0]
	for _, p := range path {
		lo = [2]float64{min(lo[0], p[0]), min(lo[1], p[1])}
		hi = [2]float64{max(hi[0], p[0]), max(hi[1], p[1])}
	}
	var gone []int
	for _, l := range w.lines {
		if slices.Contains(gone, l.ID) {
			continue
		}
		r := eraserSize + graffitiPens[l.Width]/720/2
		touched := false
		for i, p := range l.Points {
			a := l.Points[max(i-1, 0)]
			if max(a[0], p[0]) < lo[0]-r || min(a[0], p[0]) > hi[0]+r || max(a[1], p[1]) < lo[1]-r || min(a[1], p[1]) > hi[1]+r {
				continue // nowhere near (r in heights is more than enough across)
			}
			for j, e := range path {
				if near(e, a, p, r) || near(p, path[max(j-1, 0)], e, r) {
					touched = true
					break
				}
			}
			if touched {
				break
			}
		}
		if touched {
			gone = append(gone, l.ID)
		}
	}
	w.remove(gone)
	return gone
}

// undo takes back this viewer's last line still on the wall
func (w *wall) undo(from Viewer) []int {
	for i := len(w.lines) - 1; i >= 0; i-- {
		if l := w.lines[i]; l.owner == from.ID && from.ID != 0 {
			w.remove([]int{l.ID})
			return []int{l.ID}
		}
	}
	return nil
}

func (w *wall) clear() { w.lines, w.points, w.open = nil, 0, nil }

// view: the lines as the page draws them
func (w *wall) view() []Stroke {
	if w.lines == nil {
		return []Stroke{}
	}
	return w.lines
}

type graffiti struct {
	Base
	wall
	begun time.Time // when the first line went on this page; zero while it's clean
	by    []string  // who drew on it
}

func (g *graffiti) View(Viewer) any { return map[string]any{"lines": g.view()} }

func (g *graffiti) Message(r *Room, from Viewer, m Msg) {
	switch m.Kind() {
	case "line":
		if l, ok := g.draw(from, m); ok {
			if g.begun.IsZero() {
				g.begun = time.Now()
			}
			if from.Name != "" && !slices.Contains(g.by, from.Name) {
				g.by = append(g.by, from.Name)
			}
			r.All(Msg{"kind": "line", "line": l})
		}
	case "erase":
		g.gone(r, g.erase(m))
	case "undo":
		g.gone(r, g.undo(from))
	case "clear":
		if len(g.lines) == 0 {
			return
		}
		g.clear()
		g.begun, g.by = time.Time{}, nil
		r.All(Msg{"kind": "clear"})
		if r.Movie != nil {
			name := from.Name
			if name == "" {
				name = "Someone"
			}
			r.Movie.Say(name+" wiped the graffiti off", 0)
		}
	}
}

// gone: lines rubbed out or taken back; a wall left clean has no page to turn
func (g *graffiti) gone(r *Room, ids []int) {
	if len(ids) == 0 {
		return
	}
	if len(g.lines) == 0 {
		g.begun, g.by = time.Time{}, nil
	}
	r.All(Msg{"kind": "erase", "ids": ids})
}

// Tick turns the page a minute after it was begun
func (g *graffiti) Tick(r *Room, now time.Time) {
	if g.begun.IsZero() || now.Sub(g.begun) < graffitiPage || r.Movie == nil || r.Reel == nil {
		return
	}
	frame, pic, _ := r.Movie.Frame() // no movie: the lines on black
	kept, err := r.Movie.Keep(g.svg(frame, pic), "image/svg+xml")
	if err != nil {
		return
	}
	kept.At, kept.Title = pic.At, pic.Title
	r.Reel.Add(ReelPage{Picture: kept, When: now, By: g.by})
	g.clear()
	g.begun, g.by = time.Time{}, nil
	r.All(Msg{"kind": "turn"})
	r.Changed()
}

// svg: the page as a picture, 1280x720, the frame under the lines
func (g *graffiti) svg(frame []byte, pic Picture) []byte {
	var b strings.Builder
	b.WriteString(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1280" height="720" viewBox="0 0 1280 720">`)
	b.WriteString(`<rect width="1280" height="720" fill="#000"/>`)
	if len(frame) > 0 && pic.W > 0 && pic.H > 0 { // letterboxed as the stream is
		w, h := 1280.0, 1280.0*float64(pic.H)/float64(pic.W)
		if h > 720 {
			w, h = 720*float64(pic.W)/float64(pic.H), 720
		}
		fmt.Fprintf(&b, `<image x="%.1f" y="%.1f" width="%.1f" height="%.1f" href="data:image/png;base64,%s"/>`,
			(1280-w)/2, (720-h)/2, w, h, base64.StdEncoding.EncodeToString(frame))
	}
	b.WriteString(`<g fill="none" stroke-linecap="round" stroke-linejoin="round">`)
	for _, l := range g.lines {
		b.WriteString(`<polyline points="`)
		for i, p := range l.Points {
			if i > 0 {
				b.WriteByte(' ')
			}
			fmt.Fprintf(&b, "%.1f,%.1f", p[0]*1280, p[1]*720)
		}
		fmt.Fprintf(&b, `" stroke="%s" stroke-width="%g"/>`, graffitiPalette[l.Color], graffitiPens[l.Width])
	}
	b.WriteString(`</g></svg>`)
	return []byte(b.String())
}

// graffitiKept: the wall as it was left, and who had drawn on it
type graffitiKept struct {
	Lines []Stroke `json:"lines"`
	By    []string `json:"by"`
}

func (g *graffiti) Save() any { return graffitiKept{g.view(), g.by} }

func (g *graffiti) Load(b []byte) error {
	var k graffitiKept
	if err := json.Unmarshal(b, &k); err != nil {
		return err
	}
	g.by = k.By
	if len(k.Lines) > 0 {
		g.begun = time.Now() // a page left unfinished: it turns a minute from now
	}
	for _, l := range k.Lines {
		if g.points+len(l.Points) > graffitiMaxTotal {
			break
		}
		if l.ID == 0 { // kept before lines had IDs: each piece its own
			l.ID = g.next + 1
		}
		g.next = max(g.next, l.ID)
		g.lines = append(g.lines, l)
		g.points += len(l.Points)
	}
	return nil
}
