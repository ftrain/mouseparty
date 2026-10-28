package main

// Graffiti: everyone draws on the video. Lines are kept in the video's own
// coordinates (0-1 across and down the 16:9 picture), so they land on the same
// spot for every viewer whatever their window.

const (
	graffitiColors    = 6     // the palette is the script's; a colour is its index
	graffitiWidths    = 3     // thin, medium, thick
	graffitiMaxPoints = 64    // in one message: a few frames of drawing
	graffitiMaxTotal  = 50000 // points in all; then the wall is full
)

// line is a piece of a stroke: the script sends one every few frames while the
// pen is down, starting where the last left off
type line struct {
	Color  int          `json:"c"`
	Width  int          `json:"w"`
	Points [][2]float64 `json:"p"`
}

type graffiti struct {
	lines  []line
	points int
}

func (g *graffiti) State() any {
	lines := g.lines
	if lines == nil {
		lines = []line{}
	}
	return map[string]any{"lines": lines}
}

func (g *graffiti) Message(r *Audience, from Viewer, m map[string]any) {
	if m["kind"] != "line" {
		return
	}
	c, ok1 := number(m, "c", 0, graffitiColors-1)
	w, ok2 := number(m, "w", 0, graffitiWidths-1)
	raw, ok3 := m["p"].([]any)
	if !ok1 || !ok2 || !ok3 || len(raw) < 2 || len(raw) > graffitiMaxPoints || g.points+len(raw) > graffitiMaxTotal {
		return
	}
	l := line{Color: int(c), Width: int(w)}
	for _, p := range raw {
		xy, ok := p.([]any)
		if !ok || len(xy) != 2 {
			return
		}
		x, okx := xy[0].(float64)
		y, oky := xy[1].(float64)
		if !okx || !oky || x != x || y != y {
			return
		}
		l.Points = append(l.Points, [2]float64{min(max(x, 0), 1), min(max(y, 0), 1)})
	}
	g.lines = append(g.lines, l)
	g.points += len(l.Points)
	r.Send(map[string]any{"kind": "line", "line": l})
}

func (g *graffiti) Left(*Audience, Viewer) {}
