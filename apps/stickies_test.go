package apps

import (
	"encoding/json"
	"fmt"
	"testing"
)

func TestStickies(t *testing.T) {
	m := &testMovie{pos: 200} // a movie (k2), not paged
	r, _ := testRoom(ann)
	r.Movie = m
	s := newStickies(r).(*stickies)
	nobody := Viewer{ID: 9}
	s.Message(r, nobody, Msg{"kind": "add", "text": "hi", "c": 1.0, "x": 0.5, "y": 0.5, "at": 12.0})
	if len(s.View(ann).(map[string]any)["notes"].([]Sticky)) != 0 {
		t.Fatal("a note no one signed")
	}
	s.Message(r, ann, Msg{"kind": "add", "text": "  look at this  ", "c": 2.0, "x": 0.25, "y": 0.75, "at": 12.34})
	s.Message(r, ann, Msg{"kind": "add", "text": "on a page", "c": 2.0, "x": 0.25, "y": 0.75, "page": 3.0}) // no moment: not on a movie
	notes := s.View(bob).(map[string]any)["notes"].([]Sticky)
	if len(notes) != 1 || notes[0].By != ann.Name || notes[0].Text != "look at this" || notes[0].At != 12.3 || notes[0].Color != 2 {
		t.Fatalf("%+v", notes)
	}
	id := float64(notes[0].ID)
	s.Message(r, bob, Msg{"kind": "remove", "sid": id}) // not Bob's
	s.Message(r, bob, Msg{"kind": "color", "sid": id, "c": 4.0})
	s.Message(r, ann, Msg{"kind": "color", "sid": id, "c": 5.0})
	s.Message(r, ann, Msg{"kind": "move", "sid": id, "x": 2.0, "y": 0.1}) // off the picture: kept on it
	if n := s.things["k2"].Notes; len(n) != 1 || n[0].Color != 5 || n[0].X != 1 || n[0].Y != 0.1 {
		t.Fatalf("%+v", n)
	}
	// a document: notes on pages; the movie's come back when it plays again
	m.pos = 301
	s.Tick(r, later(0))
	s.Message(r, bob, Msg{"kind": "add", "text": "page three", "c": 0.0, "x": 0.1, "y": 0.1, "page": 3.0})
	if v := s.View(ann).(map[string]any); !v["paged"].(bool) || len(v["notes"].([]Sticky)) != 1 || v["notes"].([]Sticky)[0].Page != 3 {
		t.Fatalf("%+v", v)
	}
	b, _ := json.Marshal(s.Save())
	again := newStickies(r).(*stickies)
	if err := again.Load(b); err != nil {
		t.Fatal(err)
	}
	m.pos = 200
	again.Tick(r, later(0))
	if n := again.View(bob).(map[string]any)["notes"].([]Sticky); len(n) != 1 || n[0].Text != "look at this" {
		t.Fatalf("kept: %+v", n)
	}
	s.Message(r, ann, Msg{"kind": "remove", "sid": id}) // on the document now: not there
	m.pos = 200
	s.Tick(r, later(0))
	s.Message(r, ann, Msg{"kind": "remove", "sid": id})
	if len(s.things["k2"].Notes) != 0 {
		t.Fatal("its writer took it off")
	}
	want := []string{"Ann left a note at 0:12: “look at this” @0", "Bob left a note on page 3: “page three” @3", "Ann took a note off at 0:12 @0"}
	if fmt.Sprint(m.said) != fmt.Sprint(want) {
		t.Fatalf("chat said %q, want %q", m.said, want)
	}
}
