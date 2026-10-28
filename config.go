package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
)

// The queue and settings live in ~/.tubeyap.json; nothing about a session does.
// None of the settings are in the window: the file is the place to change them.
type Config struct {
	OpenRouterPorts bool    `json:"open_router_ports"` // ask the router (NAT-PMP/UPnP) to let friends in; false = this network only
	Bitrate         string  `json:"bitrate"`
	Preset          string  `json:"preset"`
	Skip            Number  `json:"skip"`        // minutes into the first movie played
	Countdown       Number  `json:"countdown"`   // seconds of "up next" card before each movie; 0 for none
	AppMinutes      Number  `json:"app_minutes"` // how long an app from the Apps menu runs
	Queue           []*Item `json:"queue"`
	Position        int     `json:"position"` // queue row now playing, or next to play
}

// Item is one row: a movie, a song or a PDF.
type Item struct {
	Path      string        `json:"path"`
	Kind      string        `json:"kind,omitempty"` // video, audio (played over a still of its cover) or pdf (read together)
	Duration  float64       `json:"duration,omitempty"`
	Note      string        `json:"note,omitempty"`
	Pages     int           `json:"pages,omitempty"`
	Page      int           `json:"page,omitempty"`
	Subtitles *[]Track      `json:"subtitles,omitempty"` // what was found; nil until looked for
	Subs      *SubsSettings `json:"subs,omitempty"`      // what to do with them
	Audio     *[]AudioTrack `json:"audio,omitempty"`     // its sound tracks; nil until looked at
	App       string        `json:"app,omitempty"`       // an app on viewers' pages while it plays (apps.go)
}

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

func configPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".tubeyap.json")
}

func loadConfig() *Config {
	cfg := &Config{OpenRouterPorts: true, Bitrate: "1500k", Preset: "veryfast", Countdown: 10, AppMinutes: 10, Queue: []*Item{}}
	if b, err := os.ReadFile(configPath()); err == nil {
		json.Unmarshal(b, cfg)
	}
	if cfg.Queue == nil {
		cfg.Queue = []*Item{}
	}
	cfg.Position = max(0, min(cfg.Position, len(cfg.Queue)))
	return cfg
}

func saveConfig(cfg *Config) {
	b, err := json.MarshalIndent(cfg, "", "  ")
	if err == nil {
		os.WriteFile(configPath(), b, 0o644)
	}
}
