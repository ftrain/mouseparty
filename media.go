package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/pdfcpu/pdfcpu/pkg/api"
)

// What can be dropped in, by name: the usual names of what ffmpeg reads (it has
// every demuxer and decoder). Whether a file turns out to be sound or a picture
// is ffmpeg's to say when it's added; a file by itself with an unusual name is
// asked about (playable).
var (
	videoExts = exts(".mp4", ".m4v", ".mkv", ".mk3d", ".mov", ".qt", ".avi", ".webm", ".ts", ".mts", ".m2ts", ".m2t",
		".tp", ".trp", ".mpg", ".mpeg", ".mpe", ".m1v", ".m2v", ".vob", ".evo", ".wmv", ".asf", ".flv", ".f4v", ".3gp",
		".3g2", ".ogv", ".ogm", ".rm", ".rmvb", ".divx", ".xvid", ".dv", ".dif", ".mxf", ".nut", ".y4m", ".h264", ".264",
		".h265", ".265", ".hevc", ".ivf", ".gxf", ".bik", ".smk", ".nsv", ".amv", ".wtv", ".dvr-ms", ".vro", ".mjpeg",
		".mjpg", ".roq", ".avs", ".cpk", ".nuv", ".mod", ".tod", ".mqv")
	audioExts = exts(".mp3", ".mp2", ".mp1", ".m4a", ".m4b", ".m4r", ".aac", ".adts", ".flac", ".wav", ".wave", ".w64",
		".aif", ".aiff", ".aifc", ".caf", ".ogg", ".oga", ".opus", ".spx", ".wma", ".ac3", ".eac3", ".ec3", ".dts",
		".dtshd", ".thd", ".mlp", ".ape", ".wv", ".tta", ".tak", ".mka", ".mpc", ".ra", ".amr", ".awb", ".au", ".snd",
		".voc", ".ofr", ".dsf", ".dff", ".shn", ".gsm", ".qcp", ".8svx", ".sln", ".xa", ".rf64", ".bwf")
	docExts = exts(".pdf")
	dbExts  = exts(".db", ".sqlite", ".sqlite3", ".db3")
)

// playable: ffmpeg finds sound, or a moving picture at least a second long (not a still image), in it
func playable(path string) bool {
	p := probe(path)
	return p.Error == "" && (p.Audio != "" || (p.Video != "" && p.Duration >= 1))
}

func exts(e ...string) map[string]bool {
	m := map[string]bool{}
	for _, x := range e {
		m[x] = true
	}
	return m
}

func ext(path string) string { return strings.ToLower(filepath.Ext(path)) }

func shareable(path string) bool {
	e := ext(path)
	return videoExts[e] || audioExts[e] || docExts[e] || dbExts[e] || readFormats[e] != ""
}

// kindOf: "video", "audio" (played over a still of its cover), "pdf" (read together),
// "db" (a SQLite database, looked through together) or "text" (anything else
// pandoc reads, pandoc.go: a Word file, a PowerPoint, a spreadsheet, an EPUB... read together)
func kindOf(path string) string {
	switch e := ext(path); {
	case docExts[e]:
		return "pdf"
	case dbExts[e]:
		return "db"
	case readFormats[e] != "":
		return "text"
	case audioExts[e]:
		return "audio"
	}
	return "video"
}

func formatTime(seconds float64) string {
	s := int(seconds)
	return fmt.Sprintf("%d:%02d:%02d", s/3600, s%3600/60, s%60)
}

// MediaInfo is what ffmpeg says about a file when it's given nothing to do with
// it: its length, its tags, and each stream's kind, codec, language and flags.
// (ffprobe says the same as JSON, but it's a second 60 MB program to ship.)
type MediaInfo struct {
	Duration      float64
	Title, Artist string
	Streams       []StreamInfo
	Error         string // ffmpeg's last word, when it couldn't open the file
}

type StreamInfo struct {
	Kind            string // Video, Audio, Subtitle, Data, Attachment
	Codec           string // ffmpeg's name for it: h264, aac, subrip, hdmv_pgs_subtitle
	Lang, Title     string
	Default, Forced bool
	Cover           bool // a song's artwork: a "video" stream of one picture
}

// of: the streams of one kind, in order (what ffmpeg's 0:a:n and 0:s:n count)
func (m MediaInfo) of(kind string) []StreamInfo {
	var s []StreamInfo
	for _, st := range m.Streams {
		if st.Kind == kind {
			s = append(s, st)
		}
	}
	return s
}

var (
	// "  Stream #0:1[0x2](fre): Audio: aac (LC), 48000 Hz, stereo, fltp (default)"
	streamLine   = regexp.MustCompile(`^  Stream #\d+:\d+(?:\[[^\]]*\])?(?:\(([^)]*)\))?: (\w+): ([^\s,]+)`)
	durationLine = regexp.MustCompile(`^  Duration: (\d+):(\d+):(\d+(?:\.\d+)?)`)
	tagLine      = regexp.MustCompile(`^( +)([^:]+?)\s*: (.*)$`)
)

func inspect(path string) MediaInfo {
	ctx, cancel := contextTimeout(30 * time.Second)
	defer cancel()
	out, _ := exec.CommandContext(ctx, firstTool("ffmpeg"), "-hide_banner", "-nostdin", "-i", path).CombinedOutput()
	return parseInspect(string(out))
}

// parseInspect reads ffmpeg's description of an input. Its indents say what a
// tag belongs to: four spaces, the file; six, the stream above it.
func parseInspect(text string) MediaInfo {
	var m MediaInfo
	opened, chapters := false, false
	var last string
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) != "" {
			last = strings.TrimSpace(line)
		}
		switch {
		case strings.HasPrefix(line, "Input #"):
			opened = true
		case strings.HasPrefix(line, "  Chapters:"):
			chapters = true
		case durationLine.MatchString(line):
			d := durationLine.FindStringSubmatch(line)
			h, _ := strconv.ParseFloat(d[1], 64)
			mm, _ := strconv.ParseFloat(d[2], 64)
			sec, _ := strconv.ParseFloat(d[3], 64)
			m.Duration = h*3600 + mm*60 + sec
		case streamLine.MatchString(line):
			s := streamLine.FindStringSubmatch(line)
			m.Streams = append(m.Streams, StreamInfo{Kind: s[2], Codec: s[3], Lang: s[1],
				Default: strings.Contains(line, "(default)"), Forced: strings.Contains(line, "(forced)"),
				Cover: strings.Contains(line, "(attached pic)")})
		case tagLine.MatchString(line):
			t := tagLine.FindStringSubmatch(line)
			key, value := strings.ToLower(t[2]), strings.TrimSpace(t[3])
			if len(t[1]) == 4 && len(m.Streams) == 0 && !chapters { // the file's own tags
				switch key {
				case "title":
					m.Title = value
				case "artist":
					m.Artist = value
				}
			} else if len(t[1]) == 6 && len(m.Streams) > 0 && key == "title" {
				m.Streams[len(m.Streams)-1].Title = value
			}
		}
	}
	if !opened {
		m.Error = last
		if m.Error == "" {
			m.Error = "ffmpeg couldn't read it"
		}
	}
	return m
}

// Probe: a file's length and its first video and audio codecs (a song's cover
// art doesn't count as video)
type Probe struct {
	Duration float64
	Video    string
	Audio    string
	Error    string
}

func probe(path string) Probe {
	if findTool("ffmpeg") == "" {
		return Probe{Error: "ffmpeg not found (brew install ffmpeg)"}
	}
	info := inspect(path)
	if info.Error != "" {
		return Probe{Error: info.Error}
	}
	p := Probe{Duration: info.Duration}
	for _, s := range info.Streams {
		if s.Kind == "Video" && p.Video == "" && !s.Cover {
			p.Video = s.Codec
		}
		if s.Kind == "Audio" && p.Audio == "" {
			p.Audio = s.Codec
		}
	}
	if p.Video == "" && p.Audio == "" {
		p.Error = "nothing to play"
	}
	return p
}

// pdfPages: how many pages a PDF has (0: not one that can be opened)
func pdfPages(path string) int {
	n, err := api.PageCountFile(context.Background(), path)
	if err != nil {
		return 0
	}
	return n
}

// dbMaxBytes: every viewer's browser downloads the whole database and holds it in memory
const dbMaxBytes = 512 << 20

// sqliteSize: a SQLite database's size in bytes, or why it can't be shared
func sqliteSize(path string) (int64, string) {
	f, err := os.Open(path)
	if err != nil {
		return 0, "can't open it"
	}
	defer f.Close()
	head := make([]byte, 16)
	if _, err := io.ReadFull(f, head); err != nil || string(head) != "SQLite format 3\x00" {
		return 0, "not a SQLite database"
	}
	st, err := f.Stat()
	if err != nil {
		return 0, "can't open it"
	}
	if st.Size() > dbMaxBytes {
		return st.Size(), "too big to share"
	}
	return st.Size(), ""
}

func formatBytes(n int64) string {
	switch {
	case n >= 1<<30:
		return fmt.Sprintf("%.1f GB", float64(n)/(1<<30))
	case n >= 1<<20:
		return fmt.Sprintf("%.1f MB", float64(n)/(1<<20))
	}
	return fmt.Sprintf("%d KB", max(1, n>>10))
}

// Release-name noise after the title: "time.trumpet.s01e01.dvdrip.xvid-haggis"
var (
	releaseTag = regexp.MustCompile(`(?i)^(\d{3,4}p|[hx]\.?26[45]|hevc|xvid|divx|dvdrip|bdrip|brrip|bluray|web-?dl|webrip|hdtv|aac|ac3|dts|proper|repack|remux|10bit)$`)
	episode    = regexp.MustCompile(`(?i)^s\d+e\d+$`)
	smallWords = map[string]bool{"a": true, "an": true, "and": true, "at": true, "by": true, "for": true, "in": true,
		"of": true, "on": true, "or": true, "the": true, "to": true}
)

// displayTitle: a file name as the countdown card and the list show it
func displayTitle(path string) string {
	stem := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	if strings.Contains(stem, " ") {
		return stem
	}
	words := regexp.MustCompile(`[._]+`).Split(stem, -1)
	for i, w := range words {
		if i > 0 && releaseTag.MatchString(strings.SplitN(w, "-", 2)[0]) {
			words = words[:i]
			break
		}
	}
	joined := strings.Join(words, "")
	if strings.ToLower(joined) == joined && strings.ToUpper(joined) != joined { // all lowercase: title-case it
		for i, w := range words {
			switch {
			case episode.MatchString(w):
				words[i] = strings.ToUpper(w)
			case i > 0 && smallWords[w]:
			case w != "":
				r, size := utf8.DecodeRuneInString(w)
				words[i] = string(unicode.ToUpper(r)) + w[size:]
			}
		}
	}
	return strings.Join(words, " ")
}
