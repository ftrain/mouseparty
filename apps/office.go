package apps

// Documents: a Tiny Little Office document (a text, a sheet, slides, an
// outline, a diagram, a drawing, a pinboard) that everyone edits at once,
// drawn by the library's own editors on the viewer page (host_web/office/,
// built from github.com/aboard-io/tinylittleoffice).
//
// The host is the one order of operations the library asks for (its
// docs/kernel.md §12), and does nothing else: it never changes an op. A page
// sends what its editor did as {"kind": "edit", "base", "ops", "eid"}, made
// against version base, the ops as the page wrote them in JSON, passed on as
// they came (decoded and encoded again, a picture's attributes would come out
// in another order than the kernel keeps them, and the pages' texts would
// differ). When base is the latest, the ops are the next version
// and go to every page ({"kind": "ops", "seq", "by", "eid", "ops"}); when it
// isn't, the page is told to try again ({"kind": "retry"}): by then it has had
// the versions it missed, and has rebased its ops over them (the library's
// rebase), so the next try is against the latest. All the transforming is the
// pages'; the host only says which came first.
//
// The document is kept as the text a page last wrote down (snap) and the edits
// since, which a page arriving applies; the host keeps no parsed copy. It is a
// Keeper, so the class's notes are there next time: one document of each kind.

import "encoding/json"

const (
	officeMaxOps   = 2000    // in one edit: a big paste
	officeMaxText  = 1 << 20 // characters in a document written down
	officeMaxEdits = 20000   // kept between snaps; more is refused until a page writes it down
	officeSnapAt   = 200     // edits after which a page is asked to write the document down
	officeEid      = 40      // an edit's id, the page's own: at most this long
)

// officeApps: the Tiny Little Office app each document kind is drawn by
var officeApps = map[string]string{
	"write": "write", "outline": "outline", "deck": "deck", "sheet": "sheet",
	"diagram": "diagram", "draw": "draw", "pinboard": "pinboard",
}

type officeEdit struct {
	Seq int    `json:"seq"`
	By  int    `json:"by"` // the page's socket: not kept (Save drops it; nothing is keyed by IDs past a session)
	Eid string `json:"eid"`
	Ops string `json:"ops"` // a JSON array of the kernel's ops, as the page wrote it
}

type office struct {
	Base
	app   string       // write, deck, ...
	text  string       // the document as of version from
	from  int          // the version text is
	edits []officeEdit // from+1 .. seq
	seq   int          // the latest version
}

func newOffice(app string) func(*Room) Activity {
	return func(*Room) Activity { return &office{app: app} }
}

func (o *office) state() map[string]any {
	edits := o.edits
	if edits == nil {
		edits = []officeEdit{}
	}
	return map[string]any{"app": o.app, "text": o.text, "from": o.from, "edits": edits, "seq": o.seq}
}

func (o *office) View(Viewer) any { return o.state() }

func (o *office) Message(r *Room, from Viewer, m Msg) {
	switch m.Kind() {
	case "edit":
		base, ok1 := m.Int("base", 0, 1<<40)
		eid, ok2 := m["eid"].(string)
		ops, ok3 := m["ops"].(string)
		if !ok1 || !ok2 || !ok3 || len(eid) > officeEid || len(ops) > officeMaxText {
			return
		}
		if !officeOpsOK(ops) || len(o.edits) >= officeMaxEdits {
			r.To(from.ID, Msg{"kind": "refused", "eid": eid})
			return
		}
		if base != o.seq {
			r.To(from.ID, Msg{"kind": "retry", "eid": eid})
			return
		}
		o.seq++
		o.edits = append(o.edits, officeEdit{o.seq, from.ID, eid, ops})
		msg := Msg{"kind": "ops", "seq": o.seq, "by": from.ID, "eid": eid, "ops": ops}
		if len(o.edits) >= officeSnapAt && len(o.edits)%officeSnapAt == 0 {
			msg["snap"] = true // the author writes the document down
		}
		r.All(msg)
	case "snap": // a page's writing of the document at version seq
		seq, ok1 := m.Int("seq", 0, 1<<40)
		text, ok2 := m["text"].(string)
		if ok1 && ok2 && seq == o.seq && seq > o.from && len(text) <= officeMaxText {
			o.text, o.from, o.edits = text, seq, nil
		}
	case "seed": // what a new document starts as (a copy of the reel, say): only while it's empty
		text, ok := m["text"].(string)
		if ok && o.seq == 0 && o.text == "" && len(text) <= officeMaxText {
			o.text = text
			r.Changed()
		}
	case "sync": // a page that lost its way (its rebase met a conflict) starts again from the host's
		r.To(from.ID, Msg{"kind": "state", "state": o.state()})
	}
}

// officeOpsOK: ops the host can stand behind: a few of them, each one an op,
// and the library's third rule for a shared document, no op on the head's
// lock (docs/kernel.md §12), which only the server can keep
func officeOpsOK(text string) bool {
	var ops []any
	if json.Unmarshal([]byte(text), &ops) != nil || len(ops) == 0 || len(ops) > officeMaxOps {
		return false
	}
	for _, op := range ops {
		o, ok := op.(map[string]any)
		if !ok {
			return false
		}
		if name, _ := o["op"].(string); name == "" || (name == "head" && o["key"] == "lock") {
			return false
		}
	}
	return true
}

// officeKept: the document, as Save writes it
type officeKept struct {
	Text  string `json:"text"`
	From  int    `json:"from"`
	Edits []struct {
		Seq int    `json:"seq"`
		Ops string `json:"ops"`
	} `json:"edits"`
}

func (o *office) Save() any {
	k := officeKept{Text: o.text, From: o.from}
	for _, e := range o.edits {
		k.Edits = append(k.Edits, struct {
			Seq int    `json:"seq"`
			Ops string `json:"ops"`
		}{e.Seq, e.Ops})
	}
	return k
}

func (o *office) Load(b []byte) error {
	var k officeKept
	if err := json.Unmarshal(b, &k); err != nil {
		return err
	}
	o.text, o.from, o.seq = k.Text, k.From, k.From
	for _, e := range k.Edits {
		if e.Seq != o.seq+1 {
			break // a gap: what's before it stands
		}
		o.seq = e.Seq
		o.edits = append(o.edits, officeEdit{Seq: e.Seq, Eid: "kept", Ops: e.Ops})
	}
	return nil
}

// IsOffice: a document kind, drawn by host_web/apps/office.js
func IsOffice(name string) bool { return officeApps[name] != "" }
