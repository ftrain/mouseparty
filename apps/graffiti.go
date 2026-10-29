package apps

// Graffiti: everyone draws on the video. Lines are kept in the video's own
// coordinates (0-1 across and down the 16:9 picture), so they land on the same
// spot for every viewer whatever their window. Sketch draws the same way.

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
		r.All(Msg{"kind": "line", "line": l})
	}
}
