package main

// Find a movie's subtitles and turn them into timed lines for viewers.
//
// Two kinds of subtitles exist. Text tracks (SRT, ASS, mov_text, WebVTT, in the
// file or beside it) can be sent to viewers to turn on and off themselves.
// Picture tracks (Blu-ray PGS, DVD VobSub, DVB) are images: they can only be
// burned into the video.

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"golang.org/x/text/language"
	"golang.org/x/text/language/display"
)

var (
	textCodecs = map[string]bool{"subrip": true, "srt": true, "ass": true, "ssa": true, "mov_text": true, "webvtt": true, "text": true}
	subExts    = exts(".srt", ".vtt", ".ass", ".ssa")
)

// Track is one subtitle track: in the file (Kind "embedded", Index among its
// subtitle tracks, what ffmpeg's 0:s:n and si=n mean) or a file beside it.
type Track struct {
	Key   string `json:"key"`
	Kind  string `json:"kind"`
	Index int    `json:"index,omitempty"`
	Codec string `json:"codec,omitempty"`
	Path  string `json:"path,omitempty"`
	Lang  string `json:"lang"`
	Label string `json:"label"`
	Text  bool   `json:"text"`
}

// AudioTrack: Index is what ffmpeg's 0:a:n means
type AudioTrack struct {
	Index   int    `json:"index"`
	Lang    string `json:"lang"`
	Default bool   `json:"default"`
}

// Cue is one subtitle line in movie time; it goes to viewers as [start, end, text].
type Cue struct {
	Start, End float64
	Text       string
}

func (c Cue) MarshalJSON() ([]byte, error) { return json.Marshal([]any{c.Start, c.End, c.Text}) }

// Language names in English ("french") to their codes, for subtitle files named
// Movie.French.srt. Built from x/text's own table of two-letter codes.
var languageNames = func() map[string]string {
	m := map[string]string{}
	for a := 'a'; a <= 'z'; a++ {
		for b := 'a'; b <= 'z'; b++ {
			code := string([]rune{a, b})
			if base, err := language.ParseBase(code); err == nil {
				if name := display.English.Languages().Name(base); name != "" && !strings.Contains(name, "Unknown") {
					m[strings.ToLower(name)] = code
				}
			}
		}
	}
	return m
}()

// languageBase: "eng", "en", "fre" and "French" all come out "en"/"fr"; "" if unknown
func languageBase(code string) string {
	if code == "" || code == "und" {
		return ""
	}
	if c, ok := languageNames[strings.ToLower(code)]; ok {
		return c
	}
	tag, err := language.Parse(code)
	if err != nil {
		return ""
	}
	base, _ := tag.Base()
	if base.String() == "und" {
		return ""
	}
	return base.String()
}

// languageName: "French" for "fre"; unknown codes in capitals; "" for none
func languageName(code string) string {
	if code == "" || code == "und" {
		return ""
	}
	if b := languageBase(code); b != "" {
		return display.English.Languages().Name(language.MustParseBase(b))
	}
	return strings.ToUpper(code)
}

// short: a language as two letters ("eng" -> "en"); unknown codes as given, lowercase
func short(code string) string {
	if code == "" {
		return "?"
	}
	if b := languageBase(code); b != "" {
		return b
	}
	return strings.ToLower(code)
}

// sameLanguage: true when two codes ("eng", "en", "English") name the same known language
func sameLanguage(a, b string) bool {
	return a != "" && b != "" && a != "und" && b != "und" && short(a) == short(b)
}

// hostLanguage: the Mac's first preferred language, two letters ("en"): System Settings, then $LANG
func hostLanguage() string {
	if out, err := exec.Command("defaults", "read", "-g", "AppleLanguages").Output(); err == nil {
		if m := regexp.MustCompile(`\(\s*"?([A-Za-z]{2,3})\b`).FindSubmatch(out); m != nil {
			return short(string(m[1]))
		}
	}
	if m := regexp.MustCompile(`^([A-Za-z]{2,3})(?:[_.\-]|$)`).FindStringSubmatch(os.Getenv("LANG")); m != nil &&
		!strings.EqualFold(m[1], "c") && !strings.EqualFold(m[1], "posix") {
		return short(m[1])
	}
	return "en"
}

func audioTracks(movie string) []AudioTrack {
	tracks := []AudioTrack{}
	for n, s := range inspect(movie).of("Audio") {
		tracks = append(tracks, AudioTrack{Index: n, Lang: s.Lang, Default: s.Default})
	}
	return tracks
}

// pickAudio: the track in lang, else the file's default, else the first (nil if there are none)
func pickAudio(tracks []AudioTrack, lang string) *AudioTrack {
	for i := range tracks {
		if sameLanguage(tracks[i].Lang, lang) {
			return &tracks[i]
		}
	}
	for i := range tracks {
		if tracks[i].Default {
			return &tracks[i]
		}
	}
	if len(tracks) > 0 {
		return &tracks[0]
	}
	return nil
}

// findSubtitles: every subtitle a movie has, its own tracks, then files beside it
func findSubtitles(movie string) []Track {
	return append(embeddedSubtitles(movie), subtitlesBeside(movie)...)
}

func embeddedSubtitles(movie string) []Track {
	tracks := []Track{}
	for n, s := range inspect(movie).of("Subtitle") { // n: what ffmpeg's 0:s:n and si=n mean
		text := textCodecs[s.Codec]
		name := languageName(s.Lang)
		if name == "" {
			name = fmt.Sprintf("Track %d", n+1)
		}
		label := name
		if s.Title != "" && !strings.EqualFold(s.Title, name) {
			label = name + " – " + s.Title
		}
		if s.Forced {
			label += " (forced)"
		}
		if !text {
			label += " [picture: burn-in only]"
		}
		tracks = append(tracks, Track{Key: fmt.Sprintf("s:%d", n), Kind: "embedded", Index: n, Codec: s.Codec,
			Lang: s.Lang, Label: label, Text: text})
	}
	return tracks
}

func stem(path string) string { return strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)) }

// subtitlesBeside: subtitle files named after the movie: Movie.srt, Movie.en.srt, Movie.English.forced.srt
func subtitlesBeside(movie string) []Track {
	entries, err := os.ReadDir(filepath.Dir(movie))
	if err != nil {
		return nil
	}
	s := strings.ToLower(stem(movie))
	var found []Track
	for _, e := range entries { // ReadDir is sorted by name
		name := e.Name()
		if subExts[ext(name)] && strings.HasPrefix(strings.ToLower(stem(name)), s) && !strings.HasPrefix(name, ".") {
			found = append(found, subtitleFile(filepath.Join(filepath.Dir(movie), name), movie))
		}
	}
	return found
}

var forcedWord = regexp.MustCompile(`(?i)\bforced\b`)

// subtitleFile: a track for a subtitle file, its language guessed from the name (Movie.fr.srt)
func subtitleFile(path, movie string) Track {
	rest := stem(path)
	if movie != "" && strings.HasPrefix(strings.ToLower(rest), strings.ToLower(stem(movie))) {
		rest = rest[len(stem(movie)):]
	}
	lang := ""
	for _, part := range regexp.MustCompile(`[._\- ]+`).Split(rest, -1) {
		if part != "" && languageBase(part) != "" && (len(part) <= 3 || languageNames[strings.ToLower(part)] != "") {
			lang = strings.ToLower(part)
			if c := languageNames[lang]; c != "" {
				lang = c
			}
			break
		}
	}
	name := languageName(lang)
	if name == "" {
		name = "Subtitles"
	}
	forced := ""
	if forcedWord.MatchString(rest) {
		forced = " (forced)"
	}
	return Track{Key: "file:" + path, Kind: "file", Path: path, Lang: lang,
		Label: fmt.Sprintf("%s%s (%s)", name, forced, filepath.Base(path)), Text: true}
}

// cues: a text track's lines in movie time, plus offset (seconds; positive = later).
// ffmpeg converts every text format to WebVTT, so only WebVTT needs reading here.
func cues(t Track, movie string, offset float64) []Cue {
	if !t.Text {
		return nil
	}
	args := []string{"-v", "error", "-i", t.Path, "-f", "webvtt", "-"}
	if t.Kind != "file" {
		args = []string{"-v", "error", "-i", movie, "-map", fmt.Sprintf("0:s:%d", t.Index), "-f", "webvtt", "-"}
	}
	ctx, cancel := contextTimeout(300 * time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, firstTool("ffmpeg"), args...).Output()
	if err != nil && len(out) == 0 {
		return nil
	}
	found := parseWebVTT(string(out))
	for i := range found {
		found[i].Start += offset
		found[i].End += offset
	}
	return found
}

var (
	vttTiming = regexp.MustCompile(`((?:\d+:)?\d{1,2}:\d{2}\.\d{3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}\.\d{3})`)
	vttBlocks = regexp.MustCompile(`\n\s*\n`)
	vttTags   = regexp.MustCompile(`<[^>]+>`)     // <i>, <font ...>, <c.yellow>
	assTags   = regexp.MustCompile(`\{\\[^}]*\}`) // leftover ASS overrides
	entities  = strings.NewReplacer("&amp;", "&", "&lt;", "<", "&gt;", ">", "&nbsp;", " ")
)

func vttSeconds(stamp string) float64 {
	parts := strings.Split(stamp, ":")
	total := 0.0
	for _, p := range parts {
		f, _ := strconv.ParseFloat(p, 64)
		total = total*60 + f
	}
	return total
}

func parseWebVTT(vtt string) []Cue {
	var found []Cue
	for _, block := range vttBlocks.Split(strings.ReplaceAll(vtt, "\r\n", "\n"), -1) {
		lines := strings.Split(strings.Trim(block, "\n"), "\n")
		for i, line := range lines {
			m := vttTiming.FindStringSubmatch(line)
			if m == nil {
				continue
			}
			text := strings.Join(lines[i+1:], "\n")
			text = strings.TrimSpace(entities.Replace(assTags.ReplaceAllString(vttTags.ReplaceAllString(text, ""), "")))
			if text != "" {
				found = append(found, Cue{vttSeconds(m[1]), vttSeconds(m[2]), text})
			}
			break
		}
	}
	sort.SliceStable(found, func(i, j int) bool {
		if found[i].Start != found[j].Start {
			return found[i].Start < found[j].Start
		}
		return found[i].End < found[j].End
	})
	return found
}
