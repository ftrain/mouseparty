package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

// The queue and settings live in the party file (store.go), as one JSON
// setting, "config"; nothing about a session does, except what an app on
// viewers' pages keeps. None of the settings are in the window.
type Config struct {
	OpenRouterPorts bool    `json:"open_router_ports"` // ask the router (NAT-PMP/UPnP) to let friends in; false = this network only
	Bitrate         string  `json:"bitrate"`
	Preset          string  `json:"preset"`
	Skip            Number  `json:"skip"`      // minutes into the first movie played
	Countdown       Number  `json:"countdown"` // seconds of "up next" card before each movie; 0 for none
	CacheGB         Number  `json:"cache_gb"`  // downloads kept, in GB: past it the oldest go (download.go); 0 for no limit
	Queue           []*Item `json:"queue"`
	Position        int     `json:"position"` // queue row now playing, or next to play
}

// Item is one row: a movie, a song, a PDF, a database or another document, from
// a file or from a download link.
type Item struct {
	Path      string        `json:"path"`
	Kind      string        `json:"kind,omitempty"` // video, audio (played over a still of its cover), pdf or text (a document pandoc reads: read together) or db (SQLite, looked through together)
	Duration  float64       `json:"duration,omitempty"`
	Note      string        `json:"note,omitempty"`
	Pages     int           `json:"pages,omitempty"`
	Page      int           `json:"page,omitempty"`
	Size      int64         `json:"size,omitempty"`      // a database's bytes
	At        string        `json:"at,omitempty"`        // the database's page viewers were last on (a path in Datasette)
	Subtitles *[]Track      `json:"subtitles,omitempty"` // what was found; nil until looked for
	Subs      *SubsSettings `json:"subs,omitempty"`      // what to do with them
	Audio     *[]AudioTrack `json:"audio,omitempty"`     // its sound tracks; nil until looked at
	URL       string        `json:"url,omitempty"`       // a download link (download.go): Path is its download, in the cache
	Got       bool          `json:"got,omitempty"`       // the download is complete; until then the row is off, counting bytes
	Cleared   bool          `json:"cleared,omitempty"`   // cleared from the cache (the limit, or Clear Download Cache): fetched again only on a double-click
	Missing   bool          `json:"-"`                   // its file isn't there now (App.watchFiles)
	dl        *download     // the download under way (download.go); nil otherwise
}

// isDoc: a PDF, a database or another document, which viewers' pages show themselves (the stream carries a card)
func (it *Item) isDoc() bool { return it.kind() == "pdf" || it.kind() == "db" || it.kind() == "text" }

// paged: a PDF, or another document laid out (by viewers' pages: session.go SetPages), has pages to slide through
func (it *Item) paged() bool { return (it.kind() == "pdf" || it.kind() == "text") && it.Pages > 0 }

func (it *Item) kind() string {
	if it.Kind == "" {
		return "video"
	}
	return it.Kind
}

// SubsSettings: Mode is "viewers" (each viewer turns them on), "burn" (one track,
// Burn, drawn into the video for everyone) or "off". Offset shifts them, in
// seconds (positive = later). Files are subtitle files dropped onto the movie.
type SubsSettings struct {
	Mode   string   `json:"mode"`
	Burn   string   `json:"burn,omitempty"`
	Offset float64  `json:"offset"`
	Files  []string `json:"files"`
}

// Number reads a setting written either as a number or as a string ("10"), as
// the Python app wrote them.
type Number float64

func (n *Number) UnmarshalJSON(b []byte) error {
	var s string
	if json.Unmarshal(b, &s) == nil {
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			f = 0
		}
		*n = Number(f)
		return nil
	}
	var f float64
	if err := json.Unmarshal(b, &f); err != nil {
		return err
	}
	*n = Number(f)
	return nil
}

// dataDir: everything the app keeps, ~/Library/Application Support/Mouse Party
func dataDir() string {
	dir, _ := os.UserConfigDir()
	return filepath.Join(dir, "Mouse Party")
}

// loadConfig: the settings kept in the party, or the defaults (p nil: nothing kept)
func loadConfig(p *party) *Config {
	cfg := &Config{OpenRouterPorts: true, Bitrate: "2500k", Preset: "veryfast", Countdown: 10, CacheGB: 20, Queue: []*Item{}}
	if p != nil {
		if b, ok := p.setting("config"); ok {
			json.Unmarshal(b, cfg)
		}
	}
	if cfg.Queue == nil {
		cfg.Queue = []*Item{}
	}
	cfg.Position = max(0, min(cfg.Position, len(cfg.Queue)))
	cfg.Bitrate = fmt.Sprintf("%dk", nearestBitrate(kbps(cfg.Bitrate))) // one of the Settings window's choices
	return cfg
}

func saveConfig(p *party, cfg *Config) {
	if p == nil {
		return
	}
	if b, err := json.Marshal(cfg); err == nil {
		p.setSetting("config", b)
	}
}
