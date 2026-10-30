package apps

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func edit(base int, eid string, ops string) Msg {
	return Msg{"kind": "edit", "base": float64(base), "eid": eid, "ops": ops}
}

// as the page writes them: the attributes' order is the kernel's, and is kept
const typed = `[{"op":"splice","at":0,"n":0,"blocks":[{"k":"fence","lang":"image","body":"asset:1","a":{"kv":{"alt":"x","w":"2","h":"1"}}}]}]`

// The host only orders: the latest version's edit goes to everyone, a late one is sent back to try again
func TestOfficeOrders(t *testing.T) {
	r, out := testRoom(ann, bob)
	o := newOffice("write")(r).(*office)
	o.Message(r, ann, edit(0, "a1", typed))
	o.Message(r, bob, edit(0, "b1", typed)) // made against 0, which is no longer the latest
	if len(*out) != 2 || (*out)[0].to != 0 || (*out)[0].msg["kind"] != "ops" || (*out)[0].msg["seq"] != 1 || (*out)[0].msg["by"] != 1 || (*out)[0].msg["ops"] != typed {
		t.Fatal(*out)
	}
	if (*out)[1].to != bob.ID || (*out)[1].msg["kind"] != "retry" || (*out)[1].msg["eid"] != "b1" {
		t.Fatal("Bob wasn't told to try again:", (*out)[1])
	}
	o.Message(r, bob, edit(1, "b1", typed)) // rebased over Ann's
	if o.seq != 2 || len(o.edits) != 2 {
		t.Fatal(o.seq)
	}

	// a page arriving gets the text written down and the edits since
	v := o.View(cat).(map[string]any)
	if v["app"] != "write" || v["seq"] != 2 || len(v["edits"].([]officeEdit)) != 2 {
		t.Fatal(v)
	}
	o.Message(r, ann, Msg{"kind": "snap", "seq": 1.0, "text": "stale"})
	o.Message(r, ann, Msg{"kind": "snap", "seq": 2.0, "text": "hihi\n"})
	if o.text != "hihi\n" || o.from != 2 || len(o.edits) != 0 {
		t.Fatal("snap:", o.text, o.from, len(o.edits))
	}

	// the library's rule 3: nothing sets the head's lock
	*out = nil
	o.Message(r, ann, edit(2, "a2", `[{"op":"head","key":"lock","value":"A1"}]`))
	if o.seq != 2 || (*out)[0].msg["kind"] != "refused" {
		t.Fatal(*out)
	}
	// a seed only takes in an empty document
	o.Message(r, ann, Msg{"kind": "seed", "text": "# Copied"})
	if o.text != "hihi\n" {
		t.Fatal("seeded over a document")
	}
}

// What a document was is there next time, as the text and the edits since
func TestOfficeKept(t *testing.T) {
	r, _ := testRoom(ann)
	o := newOffice("deck")(r).(*office)
	o.Message(r, ann, Msg{"kind": "seed", "text": "## Notes\n"})
	o.Message(r, ann, edit(0, "a1", typed))
	b := mustJSON(t, o.Save())
	o2 := newOffice("deck")(r).(*office)
	if err := o2.Load(b); err != nil || o2.text != "## Notes\n" || o2.seq != 1 || len(o2.edits) != 1 {
		t.Fatal(err, o2.text, o2.seq)
	}
	o2.Message(r, ann, edit(1, "a2", typed))
	if o2.seq != 2 {
		t.Fatal("didn't go on from where it was kept")
	}
}

// A minute after someone draws, the page turns: the frame and the lines go to the reel, the wall is clean
func TestGraffitiTurnsThePage(t *testing.T) {
	r, out := testRoom(ann)
	m := &testMovie{pos: 754}
	r.Movie, r.Reel = m, NewReel(nil)
	g := &graffiti{}
	g.Message(r, ann, Msg{"kind": "line", "c": 1.0, "w": 2.0, "p": []any{[]any{0.1, 0.2}, []any{0.3, 0.4}}})
	g.Tick(r, later(30*time.Second))
	if len(r.Reel.Refs()) != 0 {
		t.Fatal("turned too soon")
	}
	g.Tick(r, later(61*time.Second))
	if len(g.lines) != 0 || len(r.Reel.Refs()) != 1 || (*out)[len(*out)-1].msg["kind"] != "turn" {
		t.Fatal("didn't turn", len(g.lines), r.Reel.Refs())
	}
	svg := m.kept[0]
	if !strings.Contains(svg, `stroke="#ffcc00" stroke-width="20"`) || !strings.Contains(svg, "128.0,144.0 384.0,288.0") ||
		!strings.Contains(svg, "data:image/png;base64,cG5n") || !strings.Contains(svg, `y="93.3"`) {
		t.Fatal(svg)
	}
	deck := r.Reel.Deck()
	if !strings.Contains(deck, "## The Movie, 12:34\n") || !strings.Contains(deck, "asset:1\n```") || !strings.Contains(deck, "> Drawn by Ann, ") {
		t.Fatal(deck)
	}
	g.Tick(r, later(5*time.Minute))
	if len(r.Reel.Refs()) != 1 {
		t.Fatal("turned a clean page")
	}
}

// The reel is kept on the shelf, beside what the apps keep
func TestReelKept(t *testing.T) {
	shelf := &MemShelf{}
	NewReel(shelf).Add(ReelPage{Picture: Picture{Ref: "asset:9", W: 1280, H: 720, At: 3725}, When: time.Now()})
	if d := NewReel(shelf).Deck(); !strings.Contains(d, "## 1:02:05\n") || !strings.Contains(d, "asset:9") {
		t.Fatal(d)
	}
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// Two pages seed a new document at once: the first is the document, the second is told what it is
func TestOfficeSeedsOnce(t *testing.T) {
	r, out := testRoom(ann, bob)
	o := newOffice("pinboard")(r).(*office)
	o.Message(r, ann, Msg{"kind": "seed", "text": "Id | Kind\n--- | ---\n"})
	o.Message(r, bob, Msg{"kind": "seed", "text": "Id | Kind | X\n--- | --- | ---\n"})
	if o.text != "Id | Kind\n--- | ---\n" {
		t.Fatal("the second seed won:", o.text)
	}
	if len(*out) != 1 || (*out)[0].to != bob.ID || (*out)[0].msg["kind"] != "state" {
		t.Fatal("Bob wasn't told the document:", *out)
	}
}
