package main

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
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
