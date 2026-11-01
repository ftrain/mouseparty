package apps

// Call: talking together while watching. Whoever joins sends their microphone
// to the host's MediaMTX over WebRTC (WHIP) and hears everyone else's from it
// (WHEP), each voice its own stream; nothing of it passes through here. This
// keeps who's in the call, and gives each of them two names for their voice:
// a secret one, only in their own view, that sending to it needs, and the
// public one everyone hears it by, made from the secret (CallName), so the
// host's proxy (web.go) needs nothing from here to tell who may send where.
// The voices go through the host's Mac, to everyone in the call: callMax keeps
// that within what a home connection can send.

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
)

const callMax = 8 // in one call: each voice goes to everyone else in it, all from the host's Mac

// CallName: the public name of a voice, from its secret, which is 32 hex
// digits; false for anything else
func CallName(secret string) (string, bool) {
	if !IsCallName(secret) {
		return "", false
	}
	sum := sha256.Sum256([]byte("mouseparty call " + secret))
	return hex.EncodeToString(sum[:16]), true
}

// IsCallName: 32 lowercase hex digits, as a voice's names are
func IsCallName(s string) bool {
	if len(s) != 32 {
		return false
	}
	for _, c := range s {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

// caller is someone in the call
type caller struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	Voice  string `json:"voice"` // the public name: what the others hear them by
	Live   bool   `json:"live"`  // their page is sending
	Muted  bool   `json:"muted"`
	secret string
}

type call struct {
	Base
	in    map[int]*caller
	order []int // who joined first
}

func newCall(*Room) Activity { return &call{in: map[int]*caller{}} }

func (c *call) View(v Viewer) any {
	people := []caller{}
	for _, id := range c.order {
		people = append(people, *c.in[id])
	}
	out := map[string]any{"people": people, "max": callMax}
	if me := c.in[v.ID]; me != nil {
		out["secret"] = me.secret
	}
	return out
}

func (c *call) Message(r *Room, from Viewer, m Msg) {
	me := c.in[from.ID]
	switch m.Kind() {
	case "join":
		if me != nil || from.Name == "" || len(c.in) >= callMax {
			return
		}
		b := make([]byte, 16)
		rand.Read(b)
		secret := hex.EncodeToString(b)
		voice, _ := CallName(secret)
		c.in[from.ID] = &caller{ID: from.ID, Name: from.Name, Voice: voice, secret: secret}
		c.order = append(c.order, from.ID)
	case "live": // sending now: the others can start hearing it
		if me == nil || me.Live {
			return
		}
		me.Live = true
	case "mute":
		muted, ok := m["muted"].(bool)
		if me == nil || !ok {
			return
		}
		me.Muted = muted
	case "leave":
		if me == nil {
			return
		}
		c.drop(from.ID)
	default:
		return
	}
	r.Changed()
}

func (c *call) Joined(r *Room, v Viewer) { // a new name: the call says it
	if me := c.in[v.ID]; me != nil && v.Name != "" {
		me.Name = v.Name
	}
}

func (c *call) Left(r *Room, v Viewer) {
	if c.in[v.ID] != nil {
		c.drop(v.ID)
		r.Changed()
	}
}

func (c *call) drop(id int) {
	delete(c.in, id)
	for i, o := range c.order {
		if o == id {
			c.order = append(c.order[:i], c.order[i+1:]...)
			break
		}
	}
}
