package main

// Pages read together: the document up has one page everyone is on, and anyone
// turns it (the host's slider and arrow keys, any viewer's, the pace). A viewer's
// turn is said in chat, with a link that turns everyone back there. The pace (a
// page every so many seconds, or off) is everyone's too: anyone makes it faster
// or slower, and chat says who did.

import (
	"fmt"
	"slices"
	"time"
)

// paces: what the pace can be, seconds a page, slowest first after off
var paces = []int{0, 300, 180, 120, 90, 60, 45, 30, 20, 15, 10, 5}

const pagesMax = 100000 // a document laid out as more is someone's mistake

// pageWord: what a document's pages are called
func (d *document) pageWord() string {
	if d.App == "deck" {
		return "slide"
	}
	return "page"
}

// paceWords: "a page every 30 seconds"
func paceWords(seconds int, word string) string {
	switch {
	case seconds == 0:
		return "off"
	case seconds%60 == 0 && seconds >= 120:
		return fmt.Sprintf("a %s every %d minutes", word, seconds/60)
	case seconds == 60:
		return fmt.Sprintf("a %s a minute", word)
	}
	return fmt.Sprintf("a %s every %d seconds", word, seconds)
}

// paged: the document up has pages to slide through (a database's are Datasette's, not a row of them)
func (d *document) paged() bool { return d != nil && d.Kind != "db" && d.Pages > 0 }

// Turn: a viewer turned everyone's page (their slider rested, their arrow keys, a link in chat); chat says so
func (h *Host) Turn(name, token string, page int) {
	h.mu.Lock()
	d := h.doc
	ok := d.paged() && d.Token == token && page >= 1 && page <= d.Pages && page != d.Page
	var word string
	if ok {
		word = d.pageWord()
	}
	chat, turned := h.chat, h.Turned
	h.mu.Unlock()
	if !ok {
		return
	}
	if turned != nil {
		turned(page) // through the app, which keeps where it was left
	} else {
		h.SetPage(page)
	}
	if name == "" {
		name = "Someone"
	}
	if chat != nil {
		chat.say(map[string]any{"type": "system", "text": fmt.Sprintf("%s turned to %s %d", name, word, page),
			"doc": token, "page": page})
	}
}

// SetPages: a viewer laid out the document up (another document: its pages are the editors' layout, the same on every page)
func (h *Host) SetPages(token string, pages int) {
	h.mu.Lock()
	d := h.doc
	changed := d != nil && d.Kind == "text" && d.Token == token && pages >= 1 && pages <= pagesMax && d.Pages != pages
	if changed {
		d.Pages = pages
		d.Page = max(1, min(d.Page, pages))
	}
	told := h.DocPages
	h.mu.Unlock()
	if changed {
		h.broadcast(h.docJSON())
		if told != nil {
			told(pages)
		}
		h.repace()
	}
}

// SetPace: anyone sets everyone's pace; chat says who, and which way
func (h *Host) SetPace(name, token string, seconds int) {
	h.mu.Lock()
	d := h.doc
	ok := d.paged() && d.Token == token && slices.Contains(paces, seconds) && seconds != h.pace
	old := h.pace
	var word string
	if ok {
		h.pace, word = seconds, d.pageWord()
	}
	chat := h.chat
	h.mu.Unlock()
	if !ok {
		return
	}
	if name == "" {
		name = "Someone"
	}
	var text string
	switch {
	case seconds == 0:
		text = name + " turned the pace off"
	case old == 0:
		text = name + " set the pace: " + paceWords(seconds, word)
	case seconds < old:
		text = name + " sped the pace up: " + paceWords(seconds, word)
	default:
		text = name + " slowed the pace down: " + paceWords(seconds, word)
	}
	if chat != nil {
		chat.say(map[string]any{"type": "system", "text": text})
	}
	h.broadcast(h.docJSON())
	h.repace()
}

// EndPace: the pace reached the last page, and stops there
func (h *Host) EndPace() {
	h.mu.Lock()
	had := h.pace != 0 && h.doc.paged()
	var word string
	if had {
		h.pace, word = 0, h.doc.pageWord()
	}
	chat := h.chat
	h.mu.Unlock()
	if !had {
		return
	}
	if chat != nil {
		chat.say(map[string]any{"type": "system", "text": "The last " + word + ": the pace stopped"})
	}
	h.broadcast(h.docJSON())
	h.repace()
}

// repace: the next turn a whole interval from now (after any turn, or a new pace), or none
func (h *Host) repace() {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.paceTimer != nil {
		h.paceTimer.Stop()
		h.paceTimer = nil
	}
	if h.pace == 0 || !h.doc.paged() {
		return
	}
	token := h.doc.Token
	h.paceTimer = time.AfterFunc(time.Duration(h.pace)*time.Second, func() {
		h.mu.Lock()
		still := h.doc != nil && h.doc.Token == token && h.pace != 0
		paced := h.Paced
		h.mu.Unlock()
		if still {
			h.repace() // and again after it, unless the turn says otherwise
			if paced != nil {
				paced()
			}
		}
	})
}
