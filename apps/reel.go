package apps

// The Graffiti Reel: every minute someone drew, Graffiti turns the page, and
// the frame under the wall with the drawing on it is a page of the reel. The
// Reel app shows them as slides (a Tiny Little Office deck, read-only, its
// text written here); a page there copies it into a deck everyone can edit.

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ReelPage is a minute of graffiti: the picture, and when in what
type ReelPage struct {
	Picture
	When time.Time `json:"when"`
	By   []string  `json:"by"` // who drew on it
}

// Reel is the session's reel, kept in <dir>/reel.json between sessions
type Reel struct {
	mu      sync.Mutex
	file    string // "" keeps nothing
	pages   []ReelPage
	version int
}

const reelMax = 500 // pages; the oldest go

func NewReel(dir string) *Reel {
	r := &Reel{}
	if dir != "" {
		r.file = filepath.Join(dir, "reel.json")
		if b, err := os.ReadFile(r.file); err == nil {
			json.Unmarshal(b, &r.pages)
		}
	}
	return r
}

func (r *Reel) Add(p ReelPage) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.pages = append(r.pages, p)
	if len(r.pages) > reelMax {
		r.pages = r.pages[len(r.pages)-reelMax:]
	}
	r.version++
	if r.file == "" {
		return
	}
	if b, err := json.Marshal(r.pages); err == nil && os.MkdirAll(filepath.Dir(r.file), 0o700) == nil {
		tmp := r.file + ".tmp"
		if os.WriteFile(tmp, b, 0o600) == nil {
			os.Rename(tmp, r.file)
		}
	}
}

// Version: how many times it changed, for a viewer of it to notice
func (r *Reel) Version() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.version
}

// Refs: the pictures it names, so the host keeps them
func (r *Reel) Refs() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	var refs []string
	for _, p := range r.pages {
		refs = append(refs, p.Ref)
	}
	return refs
}

// Deck: the reel as a Tiny Little Office deck (its docs/tlo.md), oldest first:
// a title slide, then a slide a page, its time in the movie as the headline,
// the picture, and who drew it as the speaker's note
func (r *Reel) Deck() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	var b strings.Builder
	b.WriteString("---\ntitle: Graffiti Reel\ntheme: midnight\n---\n## :spray-can: Graffiti Reel {.title}\n\n")
	b.WriteString("Every minute someone drew on the movie: the frame, and what they drew.\n")
	for _, p := range r.pages {
		head := clock(p.At)
		if p.Title != "" {
			head = p.Title + ", " + head
		}
		b.WriteString("\n---\n\n## " + escapeLine(head) + "\n\n")
		fmt.Fprintf(&b, "```image {alt=%q w=%d h=%d}\n%s\n```\n", "Graffiti at "+head, p.W, p.H, p.Ref)
		if len(p.By) > 0 {
			b.WriteString("\n> Drawn by " + escapeLine(strings.Join(p.By, ", ")) + ", " + p.When.Format("Jan 2, 3:04 PM") + "\n")
		}
	}
	return b.String()
}

// clock: 754.2 seconds as "12:34", or "1:02:03"
func clock(s float64) string {
	t := int(s)
	if t >= 3600 {
		return fmt.Sprintf("%d:%02d:%02d", t/3600, t/60%60, t%60)
	}
	return fmt.Sprintf("%d:%02d", t/60, t%60)
}

// escapeLine: words that can't break out of their line, or be read as marks
func escapeLine(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	return strings.NewReplacer(`\`, `\\`, "*", `\*`, "_", `\_`, "`", "\\`", "{", `\{`, "[", `\[`, "<", `\<`, "~", `\~`, "=", `\=`, "+", `\+`).Replace(s)
}

// reelApp shows the reel, the newest page as it comes
type reelApp struct {
	Base
	reel *Reel
	seen int
}

func newReelApp(r *Room) Activity {
	if r.Reel == nil {
		r.Reel = NewReel("")
	}
	return &reelApp{reel: r.Reel, seen: r.Reel.Version()}
}

func (a *reelApp) View(Viewer) any { return map[string]any{"text": a.reel.Deck()} }

func (a *reelApp) Message(*Room, Viewer, Msg) {}

func (a *reelApp) Tick(r *Room, _ time.Time) {
	if v := a.reel.Version(); v != a.seen {
		a.seen = v
		r.Changed()
	}
}
