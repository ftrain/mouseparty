package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"
)

// makeZip: a zip of these names and contents (a name ending "@" is a symlink to its contents)
func makeZip(t *testing.T, path string, files map[string]string) {
	t.Helper()
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	for name, body := range files {
		h := &zip.FileHeader{Name: strings.TrimSuffix(name, "@"), Method: zip.Deflate}
		if strings.HasSuffix(name, "@") {
			h.SetMode(os.ModeSymlink | 0o777)
		}
		w, err := z.CreateHeader(h)
		if err != nil {
			t.Fatal(err)
		}
		w.Write([]byte(body))
	}
	z.Close()
	if err := os.WriteFile(path, buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
}

// Unpacked beside it, only what stays inside and isn't hidden; again, beside that
func TestUnzip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "Week 3.zip")
	makeZip(t, path, map[string]string{
		"Week 3\\":                      "",
		"Week 3/essay.rtf":              `{\rtf1 Vertigo}`,
		"Week 3/talk.pptx":              "slides",
		"Week 3/notes/shots.csv":        "Shot,Time\n",
		"Week 3\\notes\\cast.csv":       "Name\n",
		"Week 3/.DS_Store":              "x",
		"Week 3/Thumbs.db":              "x",
		"__MACOSX/Week 3/._essay.rtf":   "x",
		"../escaped.txt":                "x",
		"Week 3/x\\..\\..\\escaped.txt": "x",
		"Week 3\\..\\..\\up.txt":        "x",
		"\\abs.txt":                     "x",
		"/abs.txt":                      "x",
		"Week 3/link@":                  "/etc/passwd",
	})
	out, err := unzip(path)
	if err != nil {
		t.Fatal(err)
	}
	if out != filepath.Join(dir, "Week 3") {
		t.Fatal("not beside it:", out)
	}
	var got []string
	filepath.WalkDir(filepath.Dir(dir), func(f string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			rel, _ := filepath.Rel(dir, f)
			got = append(got, filepath.ToSlash(rel))
		}
		return nil
	})
	sort.Strings(got)
	want := "Week 3.zip|Week 3/essay.rtf|Week 3/notes/cast.csv|Week 3/notes/shots.csv|Week 3/talk.pptx" // its one folder, not a folder in it
	if strings.Join(got, "|") != want {
		t.Fatalf("got %v", got)
	}
	again, err := unzip(path)
	if err != nil || again != filepath.Join(dir, "Week 3 2") {
		t.Fatal("unpacked again:", again, err)
	}
}

// Names inside a zip as each system can have them: Windows's separators read as folders, nothing
// that climbs out or is hidden (by its name, or by the zip's own say), on Windows no device, no
// stream and no character it refuses, and off the Mac a name that isn't UTF-8 read in the DOS code
// page zips began with
func TestZipNames(t *testing.T) {
	entry := func(name string) *zip.File { return &zip.File{FileHeader: zip.FileHeader{Name: name}} }
	hidden := entry("Week 3/notes.txt")
	hidden.CreatorVersion, hidden.ExternalAttrs = 10<<8|20, 0x22
	for _, c := range []struct {
		f    *zip.File
		goos string
		want string
	}{
		{entry("Week 3/essay.rtf"), "linux", "Week 3/essay.rtf"},
		{entry(`Week 3\notes\cast.csv`), "linux", "Week 3/notes/cast.csv"},
		{entry("Week 3//double/"), "linux", "Week 3/double"},
		{entry(`films\x\..\..\evil.exe`), "linux", ""},
		{entry(`a\..`), "windows", ""},
		{entry("../escaped.txt"), "windows", ""},
		{entry(`\abs.txt`), "windows", ""},
		{entry("/abs.txt"), "linux", ""},
		{entry("Week 3/.DS_Store"), "linux", ""},
		{entry("__MACOSX/Week 3/._essay.rtf"), "linux", ""},
		{entry("Week 3/desktop.ini"), "windows", ""},
		{hidden, "linux", ""},
		{entry("Movie: Part 2.mkv"), "linux", "Movie: Part 2.mkv"},
		{entry("Notes /x.txt"), "linux", "Notes /x.txt"},
		{entry("Movie: Part 2.mkv"), "windows", "Movie_ Part 2.mkv"},
		{entry("Week 3/NUL.txt"), "windows", "Week 3/_NUL.txt"},
		{entry("COM1/notes.txt"), "windows", "_COM1/notes.txt"},
		{entry("Week 3/notes.txt:secret"), "windows", "Week 3/notes.txt_secret"},
		{entry("Week 3/what?.txt"), "windows", "Week 3/what_.txt"},
		{entry("Week 3. /notes.txt"), "windows", "Week 3/notes.txt"},
		{entry("C:/Windows/win.ini"), "windows", "C_/Windows/win.ini"},
		{entry("Old/Caf\x82 cr\x8ame.mp4"), "linux", "Old/Café crème.mp4"},
		{entry("Old/Caf\x82 cr\x8ame.mp4"), "windows", "Old/Café crème.mp4"},
		{entry("Old\\R\x82sum\x82.txt"), "linux", "Old/Résumé.txt"},
		{entry("Old/Caf\x82 cr\x8ame.mp4"), "darwin", "Old/Caf\x82 cr\x8ame.mp4"},
		{entry("Old/Café crème.mp4"), "linux", "Old/Café crème.mp4"},
	} {
		got, ok := zipName(c.f, c.goos)
		if ok != (c.want != "") || got != c.want {
			t.Errorf("%q (%s): %q %v, not %q", c.f.Name, c.goos, got, ok, c.want)
		}
	}
}

// Two names in a zip that come out the same (case on macOS and Windows, or the same once made
// safe): the first is kept, the rest of the zip still unpacks, and the clash is said
func TestUnzipClash(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "Clash.zip")
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	for _, f := range []struct{ name, body string }{{"Clash/a.txt", "first"}, {"Clash/a.txt", "second"}, {"Clash/b.txt", "b"}} {
		w, _ := z.Create(f.name)
		w.Write([]byte(f.body))
	}
	z.Close()
	os.WriteFile(path, buf.Bytes(), 0o644)
	out, err := unzip(path)
	if err == nil || !strings.Contains(err.Error(), "a.txt") {
		t.Fatal("no clash said:", err)
	}
	if a, _ := os.ReadFile(filepath.Join(out, "a.txt")); string(a) != "first" {
		t.Fatal("a.txt:", string(a))
	}
	if b, _ := os.ReadFile(filepath.Join(out, "b.txt")); string(b) != "b" {
		t.Fatal("what came after the clash wasn't unpacked")
	}
}

// A zip of loose files is a folder of its own name
func TestUnzipLoose(t *testing.T) {
	path := filepath.Join(t.TempDir(), "Readings.zip")
	makeZip(t, path, map[string]string{"one.docx": "x", "two/three.md": "y"})
	out, err := unzip(path)
	if err != nil || filepath.Base(out) != "Readings" {
		t.Fatal(out, err)
	}
	if _, err := os.Stat(filepath.Join(out, "two", "three.md")); err != nil {
		t.Fatal(err)
	}
}

// A zip whose name ends in a space unpacks into a folder its files are reached through; on Windows
// that folder is named as Windows names files (no space at its end, no device's name)
func TestUnzipNameEndingInSpace(t *testing.T) {
	dir := t.TempDir()
	for _, c := range []struct{ zip, goos, want string }{
		{"Lecture notes .zip", "linux", "Lecture notes "},
		{"Lecture notes .zip", "darwin", "Lecture notes "},
		{"Lecture notes .zip", "windows", "Lecture notes"},
		{"Notes. .zip", "windows", "Notes"},
		{"CON.zip", "windows", "_CON"},
		{"CON.zip", "linux", "CON"},
	} {
		if got := zipFolder(filepath.Join(dir, c.zip), c.goos); got != filepath.Join(dir, c.want) {
			t.Errorf("%q (%s): %q", c.zip, c.goos, got)
		}
	}
	path := filepath.Join(dir, "Lecture notes .zip")
	makeZip(t, path, map[string]string{"one.mp4": "x", "two/three.md": "y"})
	out, err := unzip(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range []string{"one.mp4", filepath.Join("two", "three.md")} {
		if _, err := os.Stat(filepath.Join(out, f)); err != nil {
			t.Fatal(err)
		}
	}
}

// Windows's own zips name files in the DOS code page, not UTF-8: whatever comes out is still there
// after the list has been through the party file (as JSON), and off the Mac it's named as Windows showed it
func TestUnzipDOSNames(t *testing.T) {
	path := filepath.Join(t.TempDir(), "Old.zip")
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	for _, name := range []string{"Old/plain.mp4", "Old/Caf\x82 cr\x8ame.mp4"} {
		w, err := z.CreateHeader(&zip.FileHeader{Name: name, NonUTF8: true})
		if err != nil {
			t.Fatal(err)
		}
		w.Write([]byte("x"))
	}
	z.Close()
	os.WriteFile(path, buf.Bytes(), 0o644)
	out, _ := unzip(path)
	var found []string
	filepath.WalkDir(out, func(f string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			found = append(found, f)
		}
		return nil
	})
	for _, f := range found {
		b, _ := json.Marshal(f)
		var kept string
		json.Unmarshal(b, &kept)
		if _, err := os.Stat(kept); err != nil {
			t.Errorf("%q, kept: %v", f, err)
		}
	}
	if runtime.GOOS != "darwin" && !slices.Contains(found, filepath.Join(out, "Café crème.mp4")) {
		t.Fatal(found)
	}
}

func TestUnzipBomb(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bomb.zip")
	makeZip(t, path, map[string]string{"zeros": strings.Repeat("\x00", 64<<20)}) // 64 MB in a few KB
	if _, err := unzip(path); err == nil {
		t.Fatal("a zip bomb unpacked")
	}
	if _, err := os.Stat(strings.TrimSuffix(path, ".zip")); err == nil {
		t.Fatal("it made a folder")
	}
}

// Dropped on the list: a zip's documents and a lone RTF are rows to read together; what isn't is skipped
func TestDroppedDocumentsAndZip(t *testing.T) {
	if findTool("mediamtx") == "" {
		t.Skip("needs mediamtx (adding starts hosting)")
	}
	tempHome(t)
	dir := t.TempDir()
	zipPath := filepath.Join(dir, "Class.zip")
	makeZip(t, zipPath, map[string]string{"essay.docx": "docx", "reading.pdf": "%PDF-1.4\n%%EOF\n", "README.exe": "MZ"})
	rtf := filepath.Join(dir, "Notes.rtf")
	os.WriteFile(rtf, []byte(`{\rtf1 Notes}`), 0o644)

	a := testApp(t)
	a.AddPaths([]string{zipPath, rtf, filepath.Join(dir, "nothing.exe")}, -1, -1)
	var kinds []string
	for end := time.Now().Add(10 * time.Second); time.Now().Before(end) && len(kinds) < 3; time.Sleep(50 * time.Millisecond) {
		kinds = nil
		a.wait(func() {
			for _, it := range a.cfg.Queue {
				kinds = append(kinds, filepath.Base(it.Path)+":"+it.kind())
			}
		})
	}
	if strings.Join(kinds, " ") != "essay.docx:text reading.pdf:pdf Notes.rtf:text" {
		t.Fatal(kinds)
	}
	if v := a.GetView(); v.Rows[0].Length != "DOCX" || v.Rows[2].Length != "RTF" {
		t.Fatalf("%+v", v.Rows)
	}
}

// Dropped on the Dock icon, one at a time: gathered, and added in the order they came
func TestDockDrop(t *testing.T) {
	if findTool("mediamtx") == "" {
		t.Skip("needs mediamtx (adding starts hosting)")
	}
	tempHome(t)
	dir := t.TempDir()
	var files []string
	for _, n := range []string{"b.rtf", "a.md", "c.csv"} {
		f := filepath.Join(dir, n)
		os.WriteFile(f, []byte("x"), 0o644)
		files = append(files, f)
	}
	a := testApp(t)
	for _, f := range files {
		a.openFile(f)
	}
	var got []string
	for end := time.Now().Add(5 * time.Second); time.Now().Before(end) && len(got) < 3; time.Sleep(50 * time.Millisecond) {
		got = nil
		a.wait(func() {
			for _, it := range a.cfg.Queue {
				got = append(got, filepath.Base(it.Path))
			}
		})
	}
	if strings.Join(got, " ") != "b.rtf a.md c.csv" {
		t.Fatal(got)
	}
}

// Dropped between two rows: they go there, not at the end, and the selection stays on its row
func TestDroppedWhereDropped(t *testing.T) {
	if findTool("mediamtx") == "" {
		t.Skip("needs mediamtx (adding starts hosting)")
	}
	tempHome(t)
	dir := t.TempDir()
	file := func(name string) string {
		p := filepath.Join(dir, name)
		os.WriteFile(p, []byte(`{\rtf1 `+name+`}`), 0o644)
		return p
	}
	a := testApp(t)
	order := func() string {
		var names []string
		a.wait(func() {
			for _, it := range a.cfg.Queue {
				names = append(names, strings.TrimSuffix(filepath.Base(it.Path), ".rtf"))
			}
		})
		return strings.Join(names, " ")
	}
	a.addPaths([]string{file("a.rtf"), file("d.rtf")}, -1, -1)
	a.wait(func() { a.selectRow(1) })
	a.addPaths([]string{file("b.rtf"), file("c.rtf")}, -1, 1)
	a.addPaths([]string{file("first.rtf")}, -1, 0)
	a.addPaths([]string{file("last.rtf")}, -1, 99) // past the end: the list changed since
	if got := order(); got != "first a b c d last" {
		t.Fatal(got)
	}
	var sel int
	a.wait(func() { sel = a.selected })
	if sel != 4 {
		t.Fatal("selection moved off d:", sel)
	}
}
