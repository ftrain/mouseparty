package main

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
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
		"Week 3/essay.rtf":            `{\rtf1 Vertigo}`,
		"Week 3/talk.pptx":            "slides",
		"Week 3/notes/shots.csv":      "Shot,Time\n",
		"Week 3/.DS_Store":            "x",
		"__MACOSX/Week 3/._essay.rtf": "x",
		"../escaped.txt":              "x",
		"/abs.txt":                    "x",
		"Week 3/link@":                "/etc/passwd",
	})
	out, err := unzip(path)
	if err != nil {
		t.Fatal(err)
	}
	if out != filepath.Join(dir, "Week 3") {
		t.Fatal("not beside it:", out)
	}
	var got []string
	filepath.WalkDir(dir, func(f string, d os.DirEntry, err error) error {
		if !d.IsDir() {
			rel, _ := filepath.Rel(dir, f)
			got = append(got, rel)
		}
		return nil
	})
	sort.Strings(got)
	want := "Week 3.zip|Week 3/essay.rtf|Week 3/notes/shots.csv|Week 3/talk.pptx" // its one folder, not a folder in it
	if strings.Join(got, "|") != want {
		t.Fatalf("got %v", got)
	}
	again, err := unzip(path)
	if err != nil || again != filepath.Join(dir, "Week 3 2") {
		t.Fatal("unpacked again:", again, err)
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
	t.Setenv("HOME", t.TempDir())
	dir := t.TempDir()
	zipPath := filepath.Join(dir, "Class.zip")
	makeZip(t, zipPath, map[string]string{"essay.docx": "docx", "reading.pdf": "%PDF-1.4\n%%EOF\n", "README.exe": "MZ"})
	rtf := filepath.Join(dir, "Notes.rtf")
	os.WriteFile(rtf, []byte(`{\rtf1 Notes}`), 0o644)

	a := NewApp(standby)
	a.hostSetup = func(h *Host) {
		h.HTTPPort, h.ICEPort, h.MapPorts, h.CleanLeftovers, h.Cloudflared = freePort(), freeICEPort(), false, false, ""
	}
	go a.run()
	defer a.shutdown(nil)
	a.AddPaths([]string{zipPath, rtf, filepath.Join(dir, "nothing.exe")}, -1)
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
	t.Setenv("HOME", t.TempDir())
	dir := t.TempDir()
	var files []string
	for _, n := range []string{"b.rtf", "a.md", "c.csv"} {
		f := filepath.Join(dir, n)
		os.WriteFile(f, []byte("x"), 0o644)
		files = append(files, f)
	}
	a := NewApp(standby)
	a.hostSetup = func(h *Host) {
		h.HTTPPort, h.ICEPort, h.MapPorts, h.CleanLeftovers, h.Cloudflared = freePort(), freeICEPort(), false, false, ""
	}
	go a.run()
	defer a.shutdown(nil)
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
