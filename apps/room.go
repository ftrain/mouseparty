package apps

// Room: a little space everyone walks around in, as dots with their chat names.
// Click somewhere and you walk there; what you say in the chat shows over your
// head (the script does that from the chat itself). The host only keeps where
// each one is going; viewers' pages do the walking.

// avatar is a viewer in the room; X and Y are where they're headed, 0-1 across
// and down the 16:9 floor
type avatar struct {
	ID   int     `json:"id"`
	Name string  `json:"name"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

type room struct {
	Base
	avatars map[int]*avatar
}

func (rm *room) View(Viewer) any {
	list := []*avatar{}
	for _, a := range rm.avatars {
		list = append(list, a)
	}
	return map[string]any{"avatars": list}
}

func (rm *room) Message(r *Room, from Viewer, m Msg) {
	if m.Kind() != "go" || from.Name == "" { // only people in the chat have a name to show
		return
	}
	x, okx := m.Num("x", 0, 1)
	y, oky := m.Num("y", 0, 1)
	if !okx || !oky {
		return
	}
	a := rm.avatars[from.ID]
	if a == nil { // walking in: from somewhere along the left wall
		a = &avatar{ID: from.ID}
		rm.avatars[from.ID] = a
	}
	msg := Msg{"kind": "avatar"}
	if a.Name == "" {
		msg["from"] = [2]float64{0, 0.2 + 0.6*r.Rand.Float64()}
	}
	a.Name, a.X, a.Y = from.Name, x, y
	msg["avatar"] = *a
	r.All(msg)
}

func (rm *room) Left(r *Room, who Viewer) {
	if rm.avatars[who.ID] != nil {
		delete(rm.avatars, who.ID)
		r.All(Msg{"kind": "gone", "id": who.ID})
	}
}
