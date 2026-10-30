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
// pen is down, starting where the last left off
type Stroke struct {
	Color  int          `json:"c"`
	Width  int          `json:"w"`
	Points [][2]float64 `json:"p"`
}

// ReadStroke: a stroke from a viewer's message, or false if it isn't a good one
func ReadStroke(m Msg) (Stroke, bool) {
	c, ok1 := m.Int("c", 0, graffitiColors-1)
	w, ok2 := m.Int("w", 0, graffitiWidths-1)
	raw, ok3 := m["p"].([]any)
	if !ok1 || !ok2 || !ok3 || len(raw) < 2 || len(raw) > graffitiMaxPoints {
		return Stroke{}, false
	}
	s := Stroke{Color: c, Width: w}
	for _, p := range raw {
		xy, ok := p.([]any)
		if !ok || len(xy) != 2 {
			return Stroke{}, false
		}
		x, okx := xy[0].(float64)
		y, oky := xy[1].(float64)
		if !okx || !oky || x != x || y != y {
			return Stroke{}, false
		}
		s.Points = append(s.Points, [2]float64{min(max(x, 0), 1), min(max(y, 0), 1)})
	}
	return s, true
}

type graffiti struct {
	Base
	lines  []Stroke
	points int
	begun  time.Time // when the first line went on this page; zero while it's clean
	by     []string  // who drew on it
}

func (g *graffiti) View(Viewer) any {
	lines := g.lines
	if lines == nil {
		lines = []Stroke{}
	}
	return map[string]any{"lines": lines}
}

func (g *graffiti) Message(r *Room, from Viewer, m Msg) {
	if m.Kind() != "line" {
		return
	}
	if l, ok := ReadStroke(m); ok && g.points+len(l.Points) <= graffitiMaxTotal {
		g.lines = append(g.lines, l)
		g.points += len(l.Points)
		if g.begun.IsZero() {
			g.begun = time.Now()
		}
		if from.Name != "" && !slices.Contains(g.by, from.Name) {
			g.by = append(g.by, from.Name)
		}
		r.All(Msg{"kind": "line", "line": l})
	}
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
	g.lines, g.points, g.begun, g.by = nil, 0, time.Time{}, nil
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

func (g *graffiti) Save() any { return graffitiKept{g.lines, g.by} }

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
		g.lines = append(g.lines, l)
		g.points += len(l.Points)
	}
	return nil
}
