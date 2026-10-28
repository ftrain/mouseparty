package main

// What viewers' pages show beside the video, sent over the chat socket and
// /status: subtitles, the movie's position, the guide and a PDF read together.

import "time"

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
	CC       bool   `json:"cc"`
}

type document struct {
	Token string `json:"token"`
	Path  string `json:"-"`
	Title string `json:"title"`
	Pages int    `json:"pages"`
	Page  int    `json:"page"`
}

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

// ---------- a PDF read together ----------
// While a PDF is up the stream carries a card, and viewers' pages show the document
// itself over it, fetched from /doc/<token> (that file only, for as long as it is
// up), and turned to whatever page the host is on.

func (h *Host) SetDocument(token, path, title string, pages, page int) {
	h.mu.Lock()
	h.doc = &document{token, path, title, pages, page}
	h.mu.Unlock()
	h.broadcast(h.docJSON())
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
	h.doc = nil
	h.mu.Unlock()
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

func (h *Host) broadcast(msg any) {
	h.mu.Lock()
	chat := h.chat
	h.mu.Unlock()
	if chat != nil {
		chat.sendAll(msg)
	}
}
