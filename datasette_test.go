package main

import (
	"encoding/base64"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ncruces/go-sqlite3"
)

// films: a database to put up, with a secret beside it that nothing should reach
func films(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "films.db")
	c, err := sqlite3.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	if err := c.Exec(`CREATE TABLE directors (id INTEGER PRIMARY KEY, name TEXT);
		INSERT INTO directors VALUES (1, 'Terry Gilliam'), (2, 'Agnès Varda');
		CREATE TABLE films (id INTEGER PRIMARY KEY, title TEXT, year INT, director INT REFERENCES directors(id), genre TEXT);
		INSERT INTO films VALUES (1, 'Brazil', 1985, 1, 'Comedy'), (2, 'Time Bandits', 1981, 1, 'Fantasy'),
			(3, 'Cléo from 5 to 7', 1962, 2, 'Drama'), (4, 'The Gleaners and I', 2000, 2, null);`); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(dir, "secret.txt"), []byte("not for Python"), 0o600)
	return path
}

func needPython(t *testing.T) *wasmTool {
	t.Helper()
	home := pythonHome()
	if home == "" {
		t.Skip("no Python for Datasette: scripts/build_python.sh")
	}
	was := wasmCacheDir
	wasmCacheDir = func() string { abs, _ := filepath.Abs("build/wasm-cache"); return abs }
	t.Cleanup(func() { wasmCacheDir = was })
	py := &wasmTool{name: "python", path: filepath.Join(home, "python.wasm")}
	t.Cleanup(py.close)
	return py
}

func body(t *testing.T, a *datasetteAnswerMsg) string {
	t.Helper()
	b, err := base64.StdEncoding.DecodeString(a.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// Datasette itself: its pages and SQL, and nothing it can be asked writes, reaches past the database, or runs on
func TestDatasetteOnlyReads(t *testing.T) {
	py := needPython(t)
	path := films(t)
	d := startDatasette(py, pythonHome(), path, "Films", "/k/data/t/", func(s string) { t.Log(s) })
	defer d.stop()
	get := func(p, q string) (int, string) {
		t.Helper()
		a, err := d.ask("GET", "/k/data/t"+p, q, nil)
		if err != nil {
			t.Fatal(p, err)
		}
		return a.Status, body(t, a)
	}
	if code, b := get("/films/films", ""); code != 200 || !strings.Contains(b, "Cléo from 5 to 7") || !strings.Contains(b, `href="/k/data/t/films/directors/2"`) {
		t.Fatalf("the table: %d %.300s", code, b)
	}
	if code, b := get("/films.json", "sql=select+title+from+films+where+year+<+1970&_shape=array"); code != 200 || !strings.Contains(b, "from 5 to 7") || strings.Contains(b, "Brazil") {
		t.Fatalf("SQL: %d %.300s", code, b)
	}
	for _, sql := range []string{
		"delete from films",
		"insert into films (title) values ('x')",
		"drop table films",
		"attach database '/data/secret.txt' as other",
		"pragma journal_mode = delete",
		"select load_extension('x')",
	} {
		code, b := get("/films.json", "sql="+strings.ReplaceAll(sql, " ", "+"))
		if code == 200 && !strings.Contains(b, `"ok": false`) {
			t.Errorf("%q ran: %d %.200s", sql, code, b)
		}
	}
	if code, _ := get("/films.db", ""); code == 200 {
		t.Error("the file itself was sent")
	}
	start := time.Now()
	code, b := get("/films.json", "sql=with+recursive+c(x)+as+(select+1+union+all+select+x%2B1+from+c)+select+count(*)+from+c")
	if took := time.Since(start); took > 10*time.Second || code == 200 && !strings.Contains(b, "interrupted") && !strings.Contains(b, "time limit") {
		t.Errorf("a query that never ends: %d in %v, %.200s", code, took, b)
	}
	if code, _ := get("/films/films", ""); code != 200 {
		t.Error("not answering after a stopped query")
	}
}

// All Python sees of the database's folder is the database
func TestOnlyFile(t *testing.T) {
	path := films(t)
	o := onlyFile{dir: filepath.Dir(path), name: "films.db"}
	if _, err := o.Open("secret.txt"); err == nil {
		t.Fatal("the secret beside it opened")
	}
	if _, err := o.Open("../films.db"); err == nil {
		t.Fatal("a path out opened")
	}
	entries, err := fs.ReadDir(o, ".")
	if err != nil || len(entries) != 1 || entries[0].Name() != "films.db" {
		t.Fatal(entries, err)
	}
	if f, err := o.Open("films.db"); err != nil {
		t.Fatal(err)
	} else {
		f.Close()
	}
}

// Through the host: the database up only, its pages with the script that keeps everyone on one page
func TestDatasettePages(t *testing.T) {
	py := needPython(t)
	h := &Host{python: py, key: "k"}
	h.SetDocument(document{Token: "t", Path: films(t), Title: "Films", Kind: "db"})
	defer h.ClearDocument()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{key}/data/{token}/{path...}", h.datasettePage)
	srv := httptest.NewServer(mux)
	defer srv.Close()
	get := func(p string) (int, string, string) {
		r, err := http.Get(srv.URL + p)
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		b, _ := io.ReadAll(r.Body)
		return r.StatusCode, r.Header.Get("Content-Type"), string(b)
	}
	code, kind, b := get("/k/data/t/films")
	if code != 200 || !strings.HasPrefix(kind, "text/html") || !strings.Contains(b, "type: 'went'") || !strings.Contains(b, `const base = "/k/data/t/"`) {
		t.Fatalf("%d %s %.300s", code, kind, b)
	}
	if strings.Count(b, "everyone on the same page") != 1 || strings.LastIndex(b, "</body>") < strings.Index(b, "type: 'went'") {
		t.Error("the script isn't once, inside the body")
	}
	if code, _, b := get("/k/data/t/films/films.json?_shape=array"); code != 200 || strings.Contains(b, "type: 'went'") {
		t.Errorf("JSON: %d %.200s", code, b)
	}
	if code, _, _ := get("/k/data/other/films"); code != 404 {
		t.Error("a database not up answered:", code)
	}
}

// Datasette's own files (its CSS and JS) come too: it reads them as if in a thread, and there are none
func TestDatasetteStatic(t *testing.T) {
	py := needPython(t)
	d := startDatasette(py, pythonHome(), films(t), "Films", "/k/data/t/", func(s string) { t.Log(s) })
	defer d.stop()
	a, err := d.ask("GET", "/k/data/t/-/static/app.css", "", nil)
	if err != nil || a.Status != 200 || !strings.Contains(body(t, a), "{") {
		t.Fatal(err, a.Status)
	}
}

// a database named with what a SQLite URI reads as its own (?, #, %) opens all the same
func TestDatasetteOddNames(t *testing.T) {
	py := needPython(t)
	b, err := os.ReadFile(films(t))
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"films #2.db", "100% films.db", "films?.db"} {
		path := filepath.Join(t.TempDir(), name)
		os.WriteFile(path, b, 0o644)
		d := startDatasette(py, pythonHome(), path, "Films", "/k/data/t/", func(s string) { t.Log(s) })
		a, err := d.ask("GET", "/k/data/t/.json", "", nil)
		d.stop()
		if err != nil || a.Status != 200 || !strings.Contains(body(t, a), "films") {
			t.Fatalf("%s: %v %v", name, err, a)
		}
	}
}
