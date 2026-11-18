package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"golang.org/x/image/font/gofont/gomono"
)

func TestWebVTTLinesAreTimedAndCleaned(t *testing.T) {
	vtt := "WEBVTT\n\n00:01.000 --> 00:02.500\n<i>Hello</i> &amp; welcome\n\n" +
		"1:00:05.250 --> 1:00:07.000 align:start\n{\\an8}Two\nlines\n"
	want := []Cue{{1.0, 2.5, "Hello & welcome"}, {3605.25, 3607.0, "Two\nlines"}}
	if got := parseWebVTT(vtt); !reflect.DeepEqual(got, want) {
		t.Fatalf("%v", got)
	}
}

func TestLanguagesComeOutAsTwoLetters(t *testing.T) {
	var got []string
	for _, c := range []string{"eng", "en", "fre", "fra", "ger", "jpn", "English", "xyz", ""} {
		got = append(got, short(c))
	}
	if want := []string{"en", "en", "fr", "fr", "de", "ja", "en", "xyz", "?"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("%v", got)
	}
	if languageName("ger") != "German" || languageName("und") != "" || languageName("xyz") != "XYZ" {
		t.Fatal(languageName("ger"), languageName("xyz"))
	}
}

// The host's language from its locale settings: Linux's LANGUAGE list, then LC_ALL, LC_MESSAGES
// and LANG; Windows's preferred languages ("en-US"); never C or POSIX
func TestLocalesComeOutAsTwoLetters(t *testing.T) {
	for want, env := range map[string]map[string]string{
		"fr": {"LANGUAGE": "fr_CA:en", "LANG": "de_DE.UTF-8"},
		"de": {"LANGUAGE": ":", "LC_MESSAGES": "de_AT@euro", "LANG": "en_US.UTF-8"},
		"sr": {"LC_ALL": "sr@latin"},
		"pt": {"LANG": "pt_BR.UTF-8"},
		"":   {"LANG": "C.UTF-8", "LC_ALL": "POSIX"},
	} {
		if got := envLanguage(func(k string) string { return env[k] }); got != want {
			t.Errorf("%v: %q, not %q", env, got, want)
		}
	}
	if firstLanguage([]string{"zh-Hans-CN", "en-US"}) != "zh" || firstLanguage([]string{"", "nb-NO"}) != "nb" ||
		firstLanguage(nil) != "" {
		t.Fatal(firstLanguage([]string{"zh-Hans-CN"}))
	}
}

// What a filter is given reaches ffmpeg whole: both levels of a filtergraph's escaping, and no quoting
func TestFilterValuesAreEscapedTwice(t *testing.T) {
	for in, want := range map[string]string{
		"/tmp/mouseparty-1.txt":  "/tmp/mouseparty-1.txt",
		"a:b":                    `a\\:b`,
		"a'b":                    `a\\\'b`,
		"a,b;c":                  `a\,b\;c`,
		"[x]":                    `\[x\]`,
		`a\b`:                    `a\\\\b`,
		" a ":                    `\\\ a\\\ `,
		`C:\Users\O'Brien\t.txt`: `C\\:\\\\Users\\\\O\\\'Brien\\\\t.txt`,
		"caf\xc3\xa9 \xff":       "caf\xc3\xa9\\\\\\ \xff",
	} {
		if got := filterValue(in); got != want {
			t.Errorf("%q: %s, not %s", in, got, want)
		}
	}
}

// ffmpeg itself reads the font, the words and the subtitles at paths with everything in them a
// filter treats as its own (and with no fonts of the system's to fall back on); and a Windows path,
// as a name with its backslashes and colon, the same way
func TestFilterValuesReachFFmpeg(t *testing.T) {
	ff := findTool("ffmpeg")
	if ff == "" {
		t.Skip("needs ffmpeg")
	}
	if out, _ := exec.Command(ff, "-hide_banner", "-filters").Output(); !strings.Contains(string(out), " drawtext ") ||
		!strings.Contains(string(out), " subtitles ") {
		t.Skip("needs an ffmpeg with drawtext and subtitles")
	}
	odd := "it's [a],b; c=d 50% é"
	if runtime.GOOS != "windows" {
		odd = " " + odd + `: back\slash ` + "\xff"
	}
	dir := filepath.Join(t.TempDir(), odd)
	os.MkdirAll(dir, 0o700)
	put := func(name string, b []byte) string {
		t.Helper()
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, b, 0o600); err != nil {
			t.Fatal(err)
		}
		return p
	}
	font := put("Go Mono, it's.ttf", gomono.TTF)
	words := put("words [1].txt", []byte("Mouse Party"))
	subs := put("subs; en.srt", []byte("1\n00:00:00,000 --> 00:00:05,000\nHello\n"))
	noFonts := put("fonts.conf", []byte(`<?xml version="1.0"?><fontconfig></fontconfig>`))
	run := func(vf string) {
		t.Helper()
		cmd := exec.Command(ff, "-v", "error", "-nostdin", "-f", "lavfi", "-i", "color=c=black:s=320x240:d=1", "-vf", vf,
			"-frames:v", "1", "-c:v", "png", "-f", "null", "-")
		cmd.Dir = dir
		cmd.Env = append(os.Environ(), "FONTCONFIG_FILE="+noFonts)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Errorf("%s: %v\n%s", vf, err, out)
		}
	}
	if runtime.GOOS == "windows" {
		font = filepath.Base(font)
	}
	run("drawtext=fontfile=" + filterValue(font) + ":textfile=" + filterValue(words) + ":expansion=none:fontsize=24:x=8:y=8," +
		"subtitles=filename=" + filterValue(subs))
	if runtime.GOOS != "windows" {
		windowsy := `C:\Users\O'Brien\AppData\words.txt`
		put(windowsy, []byte("Mouse Party"))
		run("drawtext=fontfile=" + filterValue(font) + ":textfile=" + filterValue(windowsy) + ":expansion=none")
	}
}

// A card is drawn with the app's own font, found on this system, and its words as they are
func TestCardsDrawInTheirFont(t *testing.T) {
	tempHome(t)
	ff := findTool("ffmpeg")
	if ff == "" {
		t.Skip("needs ffmpeg")
	}
	if out, _ := exec.Command(ff, "-hide_banner", "-filters").Output(); !strings.Contains(string(out), " drawtext ") {
		t.Skip("needs an ffmpeg with drawtext")
	}
	dir, font := cardFontRef()
	if font == "" {
		t.Fatal("no font for cards")
	}
	if dir == "" && !filepath.IsAbs(font) {
		t.Fatal("a font by name, with nowhere to find it:", font)
	}
	args, temps := documentCommand("pdf", "It's [the] notes, part 1; 50%", StreamOpts{URL: "rtsp://127.0.0.1:1/live", Bitrate: "2500k", Preset: "veryfast"})
	defer removeAll(temps)
	vf := ""
	for i, a := range args {
		if a == "-vf" {
			vf = args[i+1]
		}
	}
	if !strings.Contains(vf, "fontfile=") || strings.Contains(vf, "textfile='") {
		t.Fatal(vf)
	}
	noFonts := filepath.Join(t.TempDir(), "fonts.conf")
	os.WriteFile(noFonts, []byte(`<?xml version="1.0"?><fontconfig></fontconfig>`), 0o600)
	cmd := exec.Command(ff, "-v", "error", "-nostdin", "-f", "lavfi", "-i", "color=c=black:s=1280x720:d=1", "-vf", vf,
		"-frames:v", "1", "-c:v", "png", "-f", "null", "-")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "FONTCONFIG_FILE="+noFonts)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
}

func TestFilesBesideAMovieAndTheirLanguages(t *testing.T) {
	dir := t.TempDir()
	movie := filepath.Join(dir, "Brazil (1985).mkv")
	for _, name := range []string{"Brazil (1985).mkv", "Brazil (1985).en.srt", "Brazil (1985).French.forced.srt",
		"Brazil (1985).vtt", "Other.srt"} {
		os.WriteFile(filepath.Join(dir, name), nil, 0o644)
	}
	got := map[string][2]string{}
	for _, tr := range subtitlesBeside(movie) {
		got[filepath.Base(tr.Path)] = [2]string{tr.Lang, tr.Label}
	}
	want := map[string][2]string{
		"Brazil (1985).en.srt":            {"en", "English (Brazil (1985).en.srt)"},
		"Brazil (1985).French.forced.srt": {"fr", "French (forced) (Brazil (1985).French.forced.srt)"},
		"Brazil (1985).vtt":               {"", "Subtitles (Brazil (1985).vtt)"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%v", got)
	}
}

func TestReleaseNamesAreTidied(t *testing.T) {
	for in, want := range map[string]string{
		"time.trumpet.s01e01.dvdrip.xvid-haggis.avi": "Time Trumpet S01E01",
		"The_Thick_of_It_S01E01.mkv":                 "The Thick of It S01E01",
		"Brazil (1985).mkv":                          "Brazil (1985)",
	} {
		if got := displayTitle(in); got != want {
			t.Errorf("%s: %q", in, got)
		}
	}
}

func TestEveryPublishIsOpusOverRTSP(t *testing.T) {
	args := encodingArgs(StreamOpts{"rtsp://127.0.0.1:8554/live", "1500k", "veryfast"})
	at := func(flag string) string {
		for i, a := range args {
			if a == flag {
				return args[i+1]
			}
		}
		return ""
	}
	if at("-c:a") != "libopus" || at("-g") != "30" || at("-bf") != "0" || at("-maxrate") != "1800k" {
		t.Fatal(args)
	}
	if tail := strings.Join(args[len(args)-5:], " "); tail != "-f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/live" {
		t.Fatal(tail)
	}
}

func TestBurnedSubtitlesAreShiftedToMovieTimeAfterASkip(t *testing.T) {
	if got := burnTextSubtitles("subtitles='m.srt'", 0); !reflect.DeepEqual(got, []string{"subtitles='m.srt'"}) {
		t.Fatal(got)
	}
	want := []string{"setpts=PTS+30.000/TB", "subtitles='m.srt'", "setpts=PTS-STARTPTS"}
	if got := burnTextSubtitles("subtitles='m.srt'", 30); !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}
}

func TestSRTOffset(t *testing.T) {
	f := filepath.Join(t.TempDir(), "m.srt")
	os.WriteFile(f, []byte("1\n00:00:01,500 --> 00:00:03,000\nHi\n"), 0o644)
	out, err := offsetSRT(f, -2)
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(out)
	if b, _ := os.ReadFile(out); !strings.Contains(string(b), "00:00:00,000 --> 00:00:01,000") {
		t.Fatal(string(b))
	}
}

func TestAudioInTheHostsLanguageElseTheDefault(t *testing.T) {
	tracks := []AudioTrack{{0, "fre", true}, {1, "eng", false}}
	if pickAudio(tracks, "en").Index != 1 || pickAudio(tracks, "ja").Index != 0 {
		t.Fatal()
	}
	if pickAudio([]AudioTrack{{0, "", false}}, "en").Index != 0 || pickAudio(nil, "en") != nil {
		t.Fatal()
	}
	if !sameLanguage("eng", "en") || sameLanguage("und", "en") {
		t.Fatal()
	}
}

func TestWhatEachKindOfFileBecomes(t *testing.T) {
	var got []string
	for _, f := range []string{"Brazil.mkv", "So What.MP3", "track.flac", "Notes.PDF", "films.sqlite", "odd.xyz"} {
		got = append(got, kindOf(f))
	}
	if want := []string{"video", "audio", "audio", "pdf", "db", "video"}; !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}
}

func TestASongsPictureIsItsCoverAndNameOverItsSound(t *testing.T) {
	graph, files := audioCard(SoundInfo{Title: "So What", Artist: "Miles Davis"}, "track01", 2, "0:a:0", nil)
	defer removeAll(files)
	for _, want := range []string{"[2:v]scale=300:300", "[0:a:0]asplit[a][heard];[heard]showcqt=",
		"lagfun=decay=0.975", "vstack,scale=1280:720:flags=bicubic,gblur=sigma=10[spectrum];[1:v][spectrum]overlay=0:0", "[card][cover]overlay=120:210"} {
		if !strings.Contains(graph, want) {
			t.Errorf("no %q in %s", want, graph)
		}
	}
	var texts []string
	for _, f := range files {
		b, _ := os.ReadFile(f)
		texts = append(texts, string(b))
	}
	if strings.Count(graph, "drawtext") != 2 || !reflect.DeepEqual(texts, []string{"So What", "Miles Davis"}) {
		t.Fatal(texts)
	}

	graph, files = audioCard(SoundInfo{}, "track01", -1, "0:a:1", []string{"atempo=2.0"})
	defer removeAll(files)
	b, _ := os.ReadFile(files[0])
	if !strings.HasPrefix(graph, "[0:a:1]atempo=2.0,asplit[a][heard]") || strings.Count(graph, "drawtext") != 1 ||
		string(b) != "track01" { // no tags: the file's name
		t.Fatal(graph)
	}
}

func TestCardTextIsShortenedToFit(t *testing.T) {
	if text, size := fitText(strings.Repeat("x", 60), 1280, 72, 32, 48); text != strings.Repeat("x", 47)+"…" || size != 40 {
		t.Fatal(text, size)
	}
	if _, size := fitText("Short", 1280, 72, 32, 48); size != 72 {
		t.Fatal(size)
	}
}

func TestOnlySQLiteDatabasesAreShared(t *testing.T) {
	dir := t.TempDir()
	db, thumbs := filepath.Join(dir, "films.db"), filepath.Join(dir, "Thumbs.db")
	os.WriteFile(db, append([]byte("SQLite format 3\x00"), make([]byte, 4080)...), 0o644)
	os.WriteFile(thumbs, []byte("\xd0\xcf\x11\xe0 not SQLite at all"), 0o644)
	if size, note := sqliteSize(db); size != 4096 || note != "" {
		t.Fatal(size, note)
	}
	if _, note := sqliteSize(thumbs); note != "not a SQLite database" {
		t.Fatal(note)
	}
}

func TestADatabaseUpGoesWhereAnyoneWent(t *testing.T) {
	var went []string
	h := &Host{DocAt: func(at string) { went = append(went, at) }}
	h.SetDocument(document{Token: "t1", Title: "Films", Kind: "db"})
	h.SetAt("t0", "/old", false) // a page still on the database before
	h.SetAt("t1", "/t/films", false)
	h.SetAt("t1", "/t/films", false)
	h.SetAt("t1", "/sql", false)
	h.SetAt("t1", "", true) // anyone's Back: the page before, for everyone
	if h.doc.At != "/t/films" || !h.doc.Back || !reflect.DeepEqual(went, []string{"/t/films", "/sql", "/t/films"}) {
		t.Fatal(h.doc.At, went)
	}
	h.SetAt("t1", "", true)
	h.SetAt("t1", "", true) // nothing before the first
	if h.doc.At != "/" || h.doc.Back || len(went) != 4 {
		t.Fatal(h.doc.At, went)
	}
	h.SetDocument(document{Token: "t2", Title: "Notes", Kind: "pdf", Pages: 3, Page: 1})
	if h.SetAt("t2", "/Notes", false); h.doc.At != "" {
		t.Fatal("a PDF has no pages in Datasette")
	}
}
