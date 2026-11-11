package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// An Internet Archive page link becomes the links of its videos: of each, the h.264 MP4 if there is one, else
// the biggest; with no video, its sound; a page link naming a file, that file; any other link is left alone.
func TestArchiveLinks(t *testing.T) {
	item := func(link string) (string, string) {
		u, _ := url.Parse(link)
		return archiveItem(u)
	}
	for link, want := range map[string][2]string{
		"https://archive.org/details/a-tape-1991":              {"a-tape-1991", ""},
		"https://www.archive.org/details/a-tape-1991/":         {"a-tape-1991", ""},
		"https://archive.org/details/a-tape-1991/Side%20A.mkv": {"a-tape-1991", "Side A.mkv"},
		"https://archive.org/download/a-tape-1991/a.mp4":       {"", ""},
		"https://example.com/details/a-tape-1991":              {"", ""},
		"https://archive.org/details/":                         {"", ""},
	} {
		if id, file := item(link); id != want[0] || file != want[1] {
			t.Errorf("%s: %q %q", link, id, file)
		}
	}
	pick := func(files ...archiveFile) string { return strings.Join(archivePick(files), " | ") }
	mkv := archiveFile{"Tape 02 - 1991.mkv", "Matroska", "895593536"}
	mp4 := archiveFile{"Tape 02 - 1991.mp4", "h.264", "1100010522"}
	thumb := archiveFile{"x.thumbs/Tape_000001.jpg", "Thumbnail", "23868"}
	song, small := archiveFile{"a song.mp3", "VBR MP3", "5000000"}, archiveFile{"clip.mkv", "Matroska", "1000"}
	tape1, tape2 := archiveFile{"Tape 01.mp4", "MPEG4", "1100"}, archiveFile{"Tape 02.mp4", "MPEG4", "1200"}
	copy1 := archiveFile{"Tape 01.ia.mp4", "h.264 IA", "900"}
	for _, c := range [][2]string{
		{mp4.Name, pick(thumb, mkv, mp4, song)},                             // one tape: its h.264 copy, not the sound beside it
		{mkv.Name + " | " + small.Name, pick(song, small, mkv, thumb)},      // two videos: both
		{song.Name, pick(thumb, song)},                                      // no video: the sound
		{"", pick(thumb)},                                                   // nothing to play
		{copy1.Name + " | " + tape2.Name, pick(tape2, thumb, tape1, copy1)}, // a collection: each tape once, in order
	} {
		if c[1] != c[0] {
			t.Errorf("picked %q, not %q", c[1], c[0])
		}
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/metadata/a-tape-1991":
			w.Write([]byte(`{"files":[{"name":"Tape 02 - 1991.mkv","format":"Matroska","size":"8"},{"name":"Tape 02 - 1991.mp4","format":"h.264","size":"9"}]}`))
		case "/metadata/nothing-here":
			w.Write([]byte(`{}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	meta, down := archiveMetadata, archiveDownload
	archiveMetadata, archiveDownload = srv.URL+"/metadata/", srv.URL+"/download/"
	defer func() { archiveMetadata, archiveDownload = meta, down }()
	one := func(item, file string) (string, string) {
		links, why := archiveLinks(item, file)
		if len(links) != 1 {
			return fmt.Sprint(links), why
		}
		return links[0].String(), why
	}
	if u, why := one("a-tape-1991", ""); why != "" || u != srv.URL+"/download/a-tape-1991/Tape%2002%20-%201991.mp4" {
		t.Error(u, why)
	}
	if u, why := one("a-tape-1991", "Side A.mkv"); why != "" || u != srv.URL+"/download/a-tape-1991/Side%20A.mkv" {
		t.Error(u, why)
	}
	for _, none := range []string{"nothing-here", "no-such-item"} {
		if u, why := one(none, ""); why == "" {
			t.Error(none, u)
		}
	}
}
