package main

// What viewers' pages show beside the video, sent over the chat socket and
// /status: subtitles, the movie's position, the guide and a PDF read together.

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ftrain/mouseparty/apps"
)

// SubTrack is a subtitle track handed to viewers; Cues are fetched separately
type SubTrack struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Lang    string `json:"lang"`
	Default bool   `json:"default"`
	Cues    []Cue  `json:"-"`
}

// ScheduleRow is a line of the viewers' guide: Start is epoch seconds, or nil before Play
type ScheduleRow struct {
	Title    string `json:"title"`
	Duration int64  `json:"duration"`
	Start    *int64 `json:"start"`
	Pages    *int   `json:"pages"`
	Data     bool   `json:"data,omitempty"` // a database
	CC       bool   `json:"cc"`
}

type document struct {
	Token string   `json:"token"`
	Path  string   `json:"-"`
	Title string   `json:"title"`
	Kind  string   `json:"kind"` // "pdf", "db" or "text"
	Pages int      `json:"pages"`
	Page  int      `json:"page"`
	At    string   `json:"at"`   // a database: the page of it everyone is on ("" its first; datasette.go)
	Back  bool     `json:"back"` // and there's one before it to go back to
	trail []string // the pages before it
	// another document (text): read by pandoc as it goes up; ready when its words are, at /doc/<token>
	App   string `json:"app,omitempty"` // the editor it's drawn by: write, deck or sheet
	Ready bool   `json:"ready,omitempty"`
	Error string `json:"error,omitempty"` // why it couldn't be read
	text  string
}

// textApp: which of Tiny Little Office's editors a document is read into, by what it is
func textApp(path string) string {
	switch ext(path) {
	case ".pptx":
		return "deck"
	case ".xlsx", ".csv", ".tsv":
		return "sheet"
	}
	return "write"
}

const trailMax = 100

type clock struct {
	token    string
	position float64
	at       time.Time
}

// ---------- subtitles viewers turn on themselves ----------
// The app hands over the tracks when a movie starts and the movie's position as
// ffmpeg reports it. Viewers get both over the chat socket (and /status), fetch a
// track's lines from /subs/<token>/<id>, and show them against the position, less
// their own delay. The position, not a wall clock: viewers' clocks differ.

func (h *Host) SetSubtitles(token string, tracks []SubTrack) {
	h.mu.Lock()
	h.subsToken, h.subs = token, tracks
	h.mu.Unlock()
	h.broadcast(h.subsJSON())
}

func (h *Host) ClearSubtitles() {
	h.mu.Lock()
	h.subsToken, h.subs, h.clock = "", nil, nil
	h.mu.Unlock()
	h.broadcast(h.subsJSON())
	h.broadcast(map[string]any{"type": "clock", "clock": nil})
}

func (h *Host) SetPosition(token string, position float64) {
	now := time.Now()
	h.mu.Lock()
	var expected *float64
	if h.clock != nil && h.clock.token == token {
		e := h.clock.position + now.Sub(h.clock.at).Seconds()
		expected = &e
	}
	h.clock = &clock{token, position, now}
	// tell viewers on a new movie, a jump (seek), or every so often to keep them true
	send := expected == nil || abs(*expected-position) > 1.0 || now.Sub(h.clockSent) > 10*time.Second
	if send {
		h.clockSent = now
	}
	h.mu.Unlock()
	if send {
		h.broadcast(map[string]any{"type": "clock", "clock": h.clockJSON()})
	}
}

func abs(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}

func (h *Host) clockJSON() any {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clock == nil {
		return nil
	}
	pos := h.clock.position + time.Since(h.clock.at).Seconds()
	return map[string]any{"token": h.clock.token, "position": float64(int64(pos*100+0.5)) / 100}
}

func (h *Host) subsJSON() map[string]any {
	h.mu.Lock()
	defer h.mu.Unlock()
	tracks := h.subs
	if tracks == nil {
		tracks = []SubTrack{}
	}
	var token any
	if h.subsToken != "" {
		token = h.subsToken
	}
	return map[string]any{"type": "subs", "token": token, "tracks": tracks}
}

// SetSchedule: what's on and next, now first. Sent with this Mac's own time, so
// viewers whose clocks are off still see the right times.
func (h *Host) SetSchedule(rows []ScheduleRow) {
	h.mu.Lock()
	h.schedule = rows
	h.mu.Unlock()
	h.broadcast(h.scheduleJSON())
}

func (h *Host) scheduleJSON() map[string]any {
	h.mu.Lock()
	defer h.mu.Unlock()
	rows := h.schedule
	if rows == nil {
		rows = []ScheduleRow{}
	}
	return map[string]any{"type": "schedule", "rows": rows, "now": float64(time.Now().UnixMicro()) / 1e6}
}

// ---------- a PDF read together, a database looked through, another document read ----------
// While one is up the stream carries a card, and viewers' pages show it over the
// video: a PDF fetched from /doc/<token> (that file only, for as long as it is up),
// turned to whatever page the host is on; a database's pages, made by Datasette
// from the file opened read-only (datasette.go: the file itself never goes), on
// whichever one anyone went to last (SetAt); another document read by pandoc (pandoc.go) into
// Tiny Little Office's text, fetched from /doc/<token> as that, its pictures in
// the picture store, and drawn read-only by the editors.

func (h *Host) SetDocument(d document) {
	if d.Kind == "db" && (d.At == "" || strings.HasPrefix(d.At, "/t/") || strings.HasPrefix(d.At, "/sql")) {
		d.At = "/" // its first page (or where the viewer before Datasette had it: its pages are gone)
	}
	if d.Kind == "text" {
		d.App = textApp(d.Path)
	}
	h.mu.Lock()
	old := h.datasette
	h.doc, h.datasette = &d, nil
	if d.Kind == "db" {
		if home := pythonHome(); home != "" && h.python != nil {
			h.datasette = startDatasette(h.python, home, d.Path, d.Title, h.datasetteBase(&d), h.Log)
		}
	}
	h.mu.Unlock()
	old.stop()
	h.broadcast(h.docJSON())
	if d.Kind == "text" {
		go h.readText(h.doc)
	}
}

// readText: a document up, read by pandoc (seconds, the first time), then pages are told it's ready
func (h *Host) readText(d *document) {
	text, err := "", error(nil)
	st, serr := os.Stat(d.Path)
	switch {
	case serr != nil:
		err = serr
	case st.Size() > readMaxBytes:
		err = fmt.Errorf("it's over %d MB", readMaxBytes>>20)
	default:
		var b []byte
		if b, err = os.ReadFile(d.Path); err == nil {
			if h.reading != nil {
				h.reading <- struct{}{} // after any a viewer brought in
				defer func() { <-h.reading }()
			}
			ctx, cancel := context.WithTimeout(context.Background(), readTime)
			text, err = h.readDocument(ctx, filepath.Base(d.Path), b, d.App)
			cancel()
		}
	}
	h.mu.Lock()
	still := h.doc == d
	if still {
		d.text, d.Ready = text, err == nil
		if err != nil {
			d.Error = err.Error()
		}
	}
	h.mu.Unlock()
	if !still {
		return
	}
	if err != nil && h.Log != nil {
		h.Log("Could not read " + d.Title + ": " + err.Error())
	}
	h.broadcast(h.docJSON())
}

// SetAt: a viewer went to another page of the database up (token: which one they
// had); back, they asked for the one before it, which is the same for everyone
func (h *Host) SetAt(token, at string, back bool) {
	h.mu.Lock()
	d := h.doc
	changed := false
	if d != nil && d.Kind == "db" && d.Token == token {
		switch {
		case back && len(d.trail) > 0:
			d.At, d.trail, changed = d.trail[len(d.trail)-1], d.trail[:len(d.trail)-1], true
		case !back && d.At != at:
			d.trail = append(d.trail, d.At)
			if len(d.trail) > trailMax {
				d.trail = d.trail[1:]
			}
			d.At, changed = at, true
		}
		d.Back = len(d.trail) > 0
		at = d.At
	}
	went := h.DocAt
	h.mu.Unlock()
	if changed {
		h.broadcast(h.docJSON())
		if went != nil {
			went(at)
		}
	}
}

func (h *Host) SetPage(page int) {
	h.mu.Lock()
	changed := h.doc != nil && h.doc.Page != page
	if changed {
		h.doc.Page = page
	}
	h.mu.Unlock()
	if changed {
		h.broadcast(h.docJSON())
	}
}

func (h *Host) ClearDocument() {
	h.mu.Lock()
	had := h.doc != nil
	old := h.datasette
	h.doc, h.datasette = nil, nil
	h.mu.Unlock()
	old.stop()
	if had {
		h.broadcast(h.docJSON())
	}
}

func (h *Host) docJSON() map[string]any {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.doc == nil {
		return map[string]any{"type": "doc", "doc": nil}
	}
	d := *h.doc
	return map[string]any{"type": "doc", "doc": d}
}

func (h *Host) hello() map[string]any {
	return map[string]any{"subs": h.subsJSON(), "clock": h.clockJSON(), "schedule": h.scheduleJSON(), "doc": h.docJSON()}
}

// greeting: hello, and the apps open as this viewer sees them, for their socket
func (h *Host) greeting(v apps.Viewer) map[string]any {
	g := h.hello()
	g["apps"] = h.apps.hello(v)
	kinds := []map[string]any{}
	for _, k := range apps.Kinds {
		kinds = append(kinds, map[string]any{"name": k.Name, "title": k.Title, "icon": k.Icon, "min": k.Min})
	}
	g["kinds"], g["appsMax"] = kinds, appsMax // what the + offers
	return g
}

func (h *Host) broadcast(msg any) {
	h.mu.Lock()
	chat := h.chat
	h.mu.Unlock()
	if chat != nil {
		chat.sendAll(msg)
	}
}
