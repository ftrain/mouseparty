package main

import (
	"context"
	"database/sql"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

// films: a small database with a foreign key, written with the usual (writable) driver
func films(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "Films.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`
create table directors (id integer primary key, name text);
create table films (id integer primary key, title text, year integer, director_id integer references directors(id), genre text);
insert into directors values (1, 'Terry Gilliam'), (2, 'Agnès Varda');
insert into films values (1, 'Brazil', 1985, 1, 'Comedy'), (2, 'Time Bandits', 1981, 1, 'Fantasy'),
	(3, 'Cléo from 5 to 7', 1962, 2, 'Drama'), (4, 'The Gleaners and I', 2000, 2, null);`)
	if err != nil {
		t.Fatal(err)
	}
	return path
}

func TestADatabaseUpCanOnlyBeRead(t *testing.T) {
	path := films(t)
	d, err := openData(path, "Films")
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	other := filepath.Join(t.TempDir(), "other.db")
	for _, q := range []string{
		"delete from films",
		"insert into films (title) values ('x')",
		"create table x (a)",
		"drop table films",
		"attach database '" + other + "' as other", // another file on the Mac
		"pragma journal_mode = delete",
		"vacuum into '" + other + "'",
		"select load_extension('x')",
	} {
		p := &dataPage{}
		d.query(context.Background(), p, q)
		if !strings.HasPrefix(p.Error, "Only reading") { // the authorizer said no, not something else
			t.Errorf("%q: %q", q, p.Error)
		}
	}
	if _, err := os.Stat(other); err == nil {
		t.Error("a file was written")
	}
	p := &dataPage{}
	d.query(context.Background(), p, "select f.title, d.name from films f join directors d on d.id = f.director_id where year < 1990 order by year")
	if p.Error != "" || p.Count != "3" || p.Rows[0][0].Text != "Cléo from 5 to 7" {
		t.Fatal(p.Error, p.Count, p.Rows)
	}
	p = &dataPage{}
	d.query(context.Background(), p, "select name from pragma_table_info('films')")
	if p.Error != "" || p.Count != "5" {
		t.Fatal("what a table holds can be read:", p.Error)
	}
}

func get(t *testing.T, h *Host, path string) (int, string) {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{key}/data/{token}/{path...}", h.dataPage)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
	b, _ := io.ReadAll(w.Result().Body)
	return w.Code, string(b)
}

func TestADatabasesPagesAreMadeByTheHost(t *testing.T) {
	h := &Host{}
	h.SetDocument(document{Token: "t1", Path: films(t), Title: "Films", Kind: "db"})
	defer h.ClearDocument()

	code, page := get(t, h, "/k/data/t1/")
	if code != 200 || !strings.Contains(page, `href="/k/data/t1/t/films"`) || !strings.Contains(page, "4 rows") {
		t.Fatal(code, page)
	}
	_, page = get(t, h, "/k/data/t1/t/films?genre__exact=Comedy")
	if !strings.Contains(page, "Brazil") || strings.Contains(page, "Time Bandits") || !strings.Contains(page, "1 rows found") {
		t.Fatal("filtered:", page)
	}
	if !strings.Contains(page, `href="/k/data/t1/t/directors?id__exact=1"`) {
		t.Fatal("a foreign key goes to its row:", page)
	}
	_, page = get(t, h, "/k/data/t1/t/films?_facet=genre&_sort_desc=year")
	if !strings.Contains(page, `class="facet"`) || strings.Index(page, "The Gleaners") > strings.Index(page, "Brazil") {
		t.Fatal("faceted and sorted:", page)
	}
	_, page = get(t, h, "/k/data/t1/t/films?title__contains=raz&_search=comedy")
	if !strings.Contains(page, "Brazil") || strings.Contains(page, `class="error"`) {
		t.Fatal("contains, and search:", page)
	}
	_, page = get(t, h, "/k/data/t1/t/films?title__contains=%25")
	if strings.Contains(page, "Brazil") || strings.Contains(page, `class="error"`) {
		t.Fatal("% is a character to look for, not a wildcard:", page)
	}
	_, page = get(t, h, "/k/data/t1/t/films?genre__isnull=1")
	if !strings.Contains(page, "The Gleaners") || strings.Contains(page, "Brazil") || !strings.Contains(page, "genre is empty") {
		t.Fatal("is empty:", page)
	}
	if code, page := get(t, h, "/k/data/t1/t/films?_fcol=year&_fop=gt&_fval=1984"); code != 303 || !strings.Contains(page, "year__gt=1984") {
		t.Fatal("the filter form goes to the filter's link:", code, page)
	}
	if code, _ := get(t, h, "/k/data/t1/t/nope"); code != 404 {
		t.Fatal("no such table:", code)
	}
	if code, _ := get(t, h, "/k/data/t0/"); code != 404 {
		t.Fatal("a database no longer up:", code)
	}
	if code, _ := get(t, h, "/k/data/t1/t/films?title__contains=x';drop+table+films;--"); code != 200 {
		t.Fatal(code)
	}
	h.ClearDocument()
	if code, _ := get(t, h, "/k/data/t1/"); code != 404 {
		t.Fatal("put away:", code)
	}
}
