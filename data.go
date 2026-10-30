package main

// A SQLite database up, looked through together: the host opens it read-only and
// answers every page of it itself, so the file never leaves the Mac; viewers' pages
// show those pages in a frame over the video (host_web/data.html), all on the one
// anyone went to last (Host.SetAt). Tables, sorting, filters, facets and SQL, after
// Datasette. SQLite is modernc.org/sqlite: Go, compiled in, nothing to install.
//
// A viewer's SQL can only read this database: the file is opened read-only with
// query_only on, an authorizer allows reading and nothing else (no ATTACH, so no
// other file on the Mac), and every query has a time limit and a row limit.

import (
	"cmp"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"html/template"
	"io/fs"
	"maps"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"modernc.org/sqlite"
)

const (
	dataPageRows = 100             // a table's rows to a page
	dataSQLRows  = 1000            // a query's rows at most
	dataQueryMax = 3 * time.Second // any one query
	dataCountMax = time.Second     // counting a table's rows (else "many")
	dataFacetMax = 30              // a facet's values, and the most a suggested one may have
	dataCellMax  = 400             // characters of a value shown
	dataSuggest  = 50 * time.Millisecond
)

func init() {
	d := &sqlite.Driver{}
	d.RegisterConnectionHook(func(c sqlite.ExecQuerierContext, _ string) error {
		r, ok := c.(sqlite.AuthorizerRegisterer)
		if !ok {
			return errors.New("this SQLite can't be limited to reading")
		}
		return r.RegisterAuthorizer(onlyReading)
	})
	sql.Register("sqlite-reading", d)
}

// pragmas a page (or a viewer's SQL) may read: what a table is made of
var readPragmas = map[string]bool{"table_info": true, "table_xinfo": true, "foreign_key_list": true, "index_list": true,
	"index_info": true, "index_xinfo": true}

// onlyReading: SQLite's authorizer, asked about every part of every statement
func onlyReading(action sqlite.AuthorizerActionCode, arg1, arg2, _, _ string) sqlite.AuthorizerReturnCode {
	switch action {
	case sqlite.AuthSelect, sqlite.AuthRead, sqlite.AuthRecursive:
		return sqlite.AuthorizerOK
	case sqlite.AuthFunction:
		if !strings.EqualFold(arg2, "load_extension") {
			return sqlite.AuthorizerOK
		}
	case sqlite.AuthPragma:
		if readPragmas[strings.ToLower(arg1)] {
			return sqlite.AuthorizerOK
		}
	}
	return sqlite.AuthorizerDeny
}

// dataDB: the database up
type dataDB struct {
	db    *sql.DB
	title string
}

func openData(path, title string) (*dataDB, error) {
	dsn := (&url.URL{Scheme: "file", Path: path}).String() + "?mode=ro&_query_only=1"
	db, err := sql.Open("sqlite-reading", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(4)
	ctx, cancel := context.WithTimeout(context.Background(), dataQueryMax)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return &dataDB{db: db, title: title}, nil
}

func (d *dataDB) Close() { d.db.Close() }

// ---------- what it holds ----------

type dataTable struct {
	Name    string
	View    bool
	Columns []string
	Rows    string // "1,234", or "many" when counting took too long
	Link    string
}

type dataFK struct{ table, column string }

func quoteName(s string) string { return `"` + strings.ReplaceAll(s, `"`, `""`) + `"` }

func (d *dataDB) tables(ctx context.Context) ([]dataTable, error) {
	rows, err := d.db.QueryContext(ctx, `select name, type = 'view' from sqlite_master
		where type in ('table', 'view') and name not like 'sqlite\_%' escape '\' order by type, name`)
	if err != nil {
		return nil, err
	}
	var out []dataTable
	for rows.Next() {
		var t dataTable
		if rows.Scan(&t.Name, &t.View) == nil {
			out = append(out, t)
		}
	}
	rows.Close()
	return out, rows.Err()
}

// columns: a table's or view's columns, in order, and where each points (its foreign keys)
func (d *dataDB) columns(ctx context.Context, table string) ([]string, map[string]dataFK, error) {
	rows, err := d.db.QueryContext(ctx, `select name from pragma_table_info(?) order by cid`, table)
	if err != nil {
		return nil, nil, err
	}
	var cols []string
	for rows.Next() {
		var c string
		if rows.Scan(&c) == nil {
			cols = append(cols, c)
		}
	}
	rows.Close()
	fks := map[string]dataFK{}
	if rows, err := d.db.QueryContext(ctx, `select "from", "table", coalesce("to", '') from pragma_foreign_key_list(?)`, table); err == nil {
		for rows.Next() {
			var from string
			var fk dataFK
			if rows.Scan(&from, &fk.table, &fk.column) == nil {
				fks[from] = fk
			}
		}
		rows.Close()
	}
	return cols, fks, nil
}

func (d *dataDB) count(ctx context.Context, from string, args []any) string {
	ctx, cancel := context.WithTimeout(ctx, dataCountMax)
	defer cancel()
	var n int64
	if d.db.QueryRowContext(ctx, "select count(*) from "+from, args...).Scan(&n) != nil {
		return "many"
	}
	return commas(n)
}

func commas(n int64) string {
	s := strconv.FormatInt(n, 10)
	for i := len(s) - 3; i > 0 && s[i-1] != '-'; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}

// ---------- the pages ----------

type dataCell struct {
	Text  string
	Null  bool
	Num   bool
	Link  string // a foreign key: the row it points to
	Title string // the whole value, when Text is cut short
}

type dataCol struct {
	Name           string
	Sort, SortDesc string // links
	Sorted         string // "asc", "desc" or ""
	Facet          string // a link that adds it as a facet, or ""
}

type dataFilter struct {
	Text   string // `year > 1980`
	Remove string
}

type dataFacetValue struct {
	Value string
	Null  bool
	Count string
	Link  string // filters on it, or (On) stops
	On    bool
}

type dataFacet struct {
	Column string
	Values []dataFacetValue
	Remove string
}

type dataPage struct {
	Title   string // the database's
	Base    string // every link starts with it: /{key}/data/{token}/
	Page    string // "index", "table" or "sql"
	Tables  []dataTable
	Table   string
	View    bool
	Columns []dataCol
	Rows    [][]dataCell
	Count   string
	Showing string // "rows 1–100"
	Prev    string
	Next    string
	Filters []dataFilter
	Facets  []dataFacet
	Suggest []dataCol // columns worth a facet
	Search  string
	Ops     []dataOp
	Query   string // the table's query, as SQL (to edit)
	SQL     string
	Error   string
	Took    string
	Cut     bool // a query's rows stopped at dataSQLRows
	Clear   string
}

// dataOp: a filter, as its link says it (col__name=value), as the menu says it,
// and as SQL, %[1]s its column
type dataOp struct {
	Name, Label, SQL string
	Value            bool // it takes a value (else its link says 1)
	Like             bool // the value is a piece of the text
}

var dataOps = []dataOp{
	{"exact", "=", "%s = ?", true, false},
	{"not", "≠", "%s is not ?", true, false},
	{"contains", "contains", `%s like ? escape '\'`, true, true},
	{"gt", ">", "%s > ?", true, false},
	{"lt", "<", "%s < ?", true, false},
	{"isnull", "is empty", "(%[1]s is null or %[1]s = '')", false, false},
	{"notnull", "is not empty", "(%[1]s is not null and %[1]s != '')", false, false},
}

// dataPage answers GET /{key}/data/{token}/{path...}: the database up, if token is it
func (h *Host) dataPage(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	d, doc := h.data, h.doc
	h.mu.Unlock()
	if d == nil || doc == nil || doc.Kind != "db" || r.PathValue("token") != doc.Token {
		http.NotFound(w, r)
		return
	}
	web := viewerFiles()
	b, err := fs.ReadFile(web, "data.html")
	if err != nil {
		http.NotFound(w, r)
		return
	}
	tmpl, err := template.New("data").Parse(string(b))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	p := &dataPage{Title: d.title, Base: "/" + r.PathValue("key") + "/data/" + doc.Token + "/", Ops: dataOps}
	q := r.URL.Query()
	ctx, cancel := context.WithTimeout(r.Context(), 4*dataQueryMax)
	defer cancel()
	switch path := r.PathValue("path"); {
	case path == "":
		p.Page = "index"
		err = d.index(ctx, p)
	case path == "sql":
		p.Page = "sql"
		d.query(ctx, p, q.Get("sql"))
	case strings.HasPrefix(path, "t/"):
		p.Page = "table"
		if to := filterAdded(q); to != nil { // the filter form: to the page with it, as a link would say it
			http.Redirect(w, r, p.Base+path+"?"+to.Encode(), http.StatusSeeOther)
			return
		}
		err = d.table(ctx, p, strings.TrimPrefix(path, "t/"), q)
	default:
		http.NotFound(w, r)
		return
	}
	if errors.Is(err, errNoTable) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		p.Error = err.Error()
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := tmpl.Execute(w, p); err != nil {
		h.Log("data page: " + err.Error())
	}
}

var errNoTable = errors.New("no such table")

func (d *dataDB) index(ctx context.Context, p *dataPage) error {
	tables, err := d.tables(ctx)
	if err != nil {
		return err
	}
	for i := range tables {
		t := &tables[i]
		t.Columns, _, _ = d.columns(ctx, t.Name)
		t.Link = p.Base + "t/" + url.PathEscape(t.Name)
		if !t.View {
			t.Rows = d.count(ctx, quoteName(t.Name), nil)
		}
	}
	p.Tables = tables
	return nil
}

// filterAdded: the filter form's fields (_fcol, _fop, _fval) as a filter like any other, or nil
func filterAdded(q url.Values) url.Values {
	col := q.Get("_fcol")
	if col == "" {
		return nil
	}
	op, val := q.Get("_fop"), q.Get("_fval")
	if i := slices.IndexFunc(dataOps, func(o dataOp) bool { return o.Name == op }); i < 0 {
		op = "exact"
	} else if !dataOps[i].Value {
		val = "1"
	}
	for _, k := range []string{"_fcol", "_fop", "_fval", "_p"} {
		q.Del(k)
	}
	q.Add(col+"__"+op, val)
	return q
}

// pageURL: a page of a table, as its link says it; its methods are links to it
// changed a little, each back on its first page of rows
type pageURL struct {
	path string
	q    url.Values
}

func (u pageURL) with(change func(url.Values)) string {
	v := url.Values{}
	for k, x := range u.q {
		v[k] = slices.Clone(x)
	}
	v.Del("_p")
	change(v)
	if len(v) == 0 {
		return u.path
	}
	return u.path + "?" + v.Encode()
}

func (u pageURL) adding(k, value string) string {
	return u.with(func(v url.Values) { v.Add(k, value) })
}

func (u pageURL) without(k, value string) string {
	return u.with(func(v url.Values) {
		if v[k] = slices.DeleteFunc(v[k], func(s string) bool { return s == value }); len(v[k]) == 0 {
			v.Del(k)
		}
	})
}

// sorted: by column c, down (desc) or up
func (u pageURL) sorted(c string, desc bool) string {
	return u.with(func(v url.Values) {
		v.Del("_sort")
		v.Del("_sort_desc")
		v.Set(map[bool]string{false: "_sort", true: "_sort_desc"}[desc], c)
	})
}

func (u pageURL) page(n int) string {
	return u.with(func(v url.Values) {
		if n > 0 {
			v.Set("_p", strconv.Itoa(n))
		}
	})
}

// filters: the page's filters (col__op=value, _search) as SQL, its arguments, and as the page lists them
func filters(u pageURL, cols []string) (where string, args []any, list []dataFilter) {
	var parts []string
	keys := slices.Sorted(maps.Keys(u.q))
	for _, k := range keys {
		col, name, _ := strings.Cut(k, "__")
		if name == "" {
			name = "exact"
		}
		i := slices.IndexFunc(dataOps, func(o dataOp) bool { return o.Name == name })
		if strings.HasPrefix(k, "_") || i < 0 || !slices.Contains(cols, col) {
			continue
		}
		op := dataOps[i]
		for _, v := range u.q[k] {
			parts = append(parts, fmt.Sprintf(op.SQL, quoteName(col)))
			text := col + " " + op.Label
			switch {
			case op.Like:
				args, text = append(args, "%"+likeEscape(v)+"%"), text+" "+v
			case op.Value:
				args, text = append(args, v), text+" "+v
			}
			list = append(list, dataFilter{Text: text, Remove: u.without(k, v)})
		}
	}
	if s := strings.TrimSpace(u.q.Get("_search")); s != "" {
		var any []string
		for _, c := range cols {
			any = append(any, quoteName(c)+` like ? escape '\'`)
			args = append(args, "%"+likeEscape(s)+"%")
		}
		parts = append(parts, "("+strings.Join(any, " or ")+")")
	}
	if len(parts) > 0 {
		where = " where " + strings.Join(parts, " and ")
	}
	return where, args, list
}

func (d *dataDB) table(ctx context.Context, p *dataPage, name string, q url.Values) error {
	tables, err := d.tables(ctx)
	if err != nil {
		return err
	}
	i := slices.IndexFunc(tables, func(t dataTable) bool { return t.Name == name })
	if i < 0 {
		return errNoTable
	}
	p.Table, p.View = name, tables[i].View
	cols, fks, err := d.columns(ctx, name)
	if err != nil {
		return err
	}
	u := pageURL{p.Base + "t/" + url.PathEscape(name), q}
	from := quoteName(name)
	where, args, list := filters(u, cols)
	p.Filters, p.Search = list, strings.TrimSpace(q.Get("_search"))
	if len(list) > 0 || p.Search != "" {
		p.Clear = u.path
	}

	// sorting, and the columns' links
	sortCol, desc := q.Get("_sort"), false
	if c := q.Get("_sort_desc"); c != "" {
		sortCol, desc = c, true
	}
	if !slices.Contains(cols, sortCol) {
		sortCol = ""
	}
	facets := q["_facet"]
	for _, c := range cols {
		col := dataCol{Name: c, Sort: u.sorted(c, false), SortDesc: u.sorted(c, true)}
		if c == sortCol {
			col.Sorted = map[bool]string{false: "asc", true: "desc"}[desc]
		}
		if !slices.Contains(facets, c) {
			col.Facet = u.adding("_facet", c)
		}
		p.Columns = append(p.Columns, col)
	}
	order := ""
	if sortCol != "" {
		order = " order by " + quoteName(sortCol) + map[bool]string{false: "", true: " desc"}[desc]
	} else if !p.View {
		order = " order by rowid"
	}

	// the page of rows
	page, _ := strconv.Atoi(q.Get("_p"))
	page = max(page, 0)
	if len(args) == 0 { // to start from in SQL (filters' values aren't in the text)
		p.Query = "select * from " + from + where + order
	}
	qctx, cancel := context.WithTimeout(ctx, dataQueryMax)
	defer cancel()
	rows, err := d.db.QueryContext(qctx, fmt.Sprintf("select * from %s%s%s limit %d offset %d", from, where, order,
		dataPageRows+1, page*dataPageRows), args...)
	if err != nil {
		return err
	}
	cells, err := readRows(rows, dataPageRows+1)
	if err != nil {
		return err
	}
	if len(cells) > dataPageRows {
		cells, p.Next = cells[:dataPageRows], u.page(page+1)
	}
	if page > 0 {
		p.Prev = u.page(page - 1)
	}
	for _, row := range cells { // a foreign key: its value goes to the row it names
		for j, c := range cols {
			if fk, ok := fks[c]; ok && j < len(row) && !row[j].Null {
				to := cmp.Or(fk.column, "rowid")
				row[j].Link = p.Base + "t/" + url.PathEscape(fk.table) + "?" + url.Values{to + "__exact": {row[j].value()}}.Encode()
			}
		}
	}
	p.Rows = cells
	p.Count = d.count(ctx, from+where, args)
	if len(cells) > 0 {
		p.Showing = fmt.Sprintf("%s–%s", commas(int64(page*dataPageRows+1)), commas(int64(page*dataPageRows+len(cells))))
	}

	// facets asked for, then ones worth asking for
	for _, c := range facets {
		if slices.Contains(cols, c) {
			p.Facets = append(p.Facets, d.facet(ctx, u, c, from+where, args))
		}
	}
	if len(facets) == 0 {
		p.Suggest = d.suggest(ctx, from+where, args, p.Columns)
	}
	return nil
}

// facet: column c's commonest values in the rows found, each a link that filters on it (or stops)
func (d *dataDB) facet(ctx context.Context, u pageURL, c, from string, args []any) dataFacet {
	f := dataFacet{Column: c, Remove: u.without("_facet", c)}
	ctx, cancel := context.WithTimeout(ctx, dataQueryMax)
	defer cancel()
	rows, err := d.db.QueryContext(ctx, fmt.Sprintf("select %s, count(*) from %s group by 1 order by 2 desc, 1 limit %d",
		quoteName(c), from, dataFacetMax), args...)
	if err != nil {
		return f
	}
	defer rows.Close()
	for rows.Next() {
		var v any
		var n int64
		if rows.Scan(&v, &n) != nil {
			continue
		}
		cell := showValue(v)
		key, val := c+"__exact", cell.value()
		if cell.Null {
			key, val = c+"__isnull", "1"
		}
		fv := dataFacetValue{Value: cell.Text, Null: cell.Null, Count: commas(n), On: slices.Contains(u.q[key], val)}
		if fv.On {
			fv.Link = u.without(key, val)
		} else {
			fv.Link = u.adding(key, val)
		}
		f.Values = append(f.Values, fv)
	}
	return f
}

// suggest: columns with a few values repeated (2 to dataFacetMax of them), each
// looked at only briefly, so a big table just has no suggestions
func (d *dataDB) suggest(ctx context.Context, from string, args []any, cols []dataCol) []dataCol {
	var out []dataCol
	for _, c := range cols {
		if len(out) == 5 {
			break
		}
		sctx, cancel := context.WithTimeout(ctx, dataSuggest)
		var distinct, total int64
		err := d.db.QueryRowContext(sctx, fmt.Sprintf("select count(distinct %[1]s), count(*) from (select %[1]s from %[2]s limit 2000)",
			quoteName(c.Name), from), args...).Scan(&distinct, &total)
		cancel()
		if err == nil && distinct > 1 && distinct <= dataFacetMax && distinct < total {
			out = append(out, c)
		}
	}
	return out
}

func likeEscape(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// query: a viewer's SQL, read-only, its first dataSQLRows rows
func (d *dataDB) query(ctx context.Context, p *dataPage, text string) {
	p.SQL = text
	if strings.TrimSpace(text) == "" {
		return
	}
	qctx, cancel := context.WithTimeout(ctx, dataQueryMax)
	defer cancel()
	start := time.Now()
	rows, err := d.db.QueryContext(qctx, text)
	if err != nil {
		p.Error = sqlError(err, qctx)
		return
	}
	names, _ := rows.Columns()
	cells, err := readRows(rows, dataSQLRows+1)
	if err != nil {
		p.Error = sqlError(err, qctx)
		return
	}
	if len(cells) > dataSQLRows {
		cells, p.Cut = cells[:dataSQLRows], true
	}
	for _, n := range names {
		p.Columns = append(p.Columns, dataCol{Name: n})
	}
	p.Rows = cells
	p.Count = commas(int64(len(cells)))
	p.Took = fmt.Sprintf("%.1f ms", float64(time.Since(start).Microseconds())/1000)
}

func sqlError(err error, ctx context.Context) string {
	if ctx.Err() != nil {
		return fmt.Sprintf("That took longer than %d seconds, so it was stopped.", int(dataQueryMax.Seconds()))
	}
	s := err.Error()
	if strings.Contains(s, "not authorized") || strings.Contains(s, "authorization denied") {
		return "Only reading: that would change the database, or reach past it. (" + s + ")"
	}
	return s
}

func readRows(rows *sql.Rows, most int) ([][]dataCell, error) {
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	var out [][]dataCell
	vals := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range vals {
		ptrs[i] = &vals[i]
	}
	for len(out) < most && rows.Next() {
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		row := make([]dataCell, len(cols))
		for i, v := range vals {
			row[i] = showValue(v)
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// showValue: a value as a cell; Title keeps the whole of one cut short
func showValue(v any) dataCell {
	switch x := v.(type) {
	case nil:
		return dataCell{Text: "null", Null: true}
	case int64:
		return dataCell{Text: strconv.FormatInt(x, 10), Num: true}
	case float64:
		return dataCell{Text: strconv.FormatFloat(x, 'g', -1, 64), Num: true}
	case bool:
		return dataCell{Text: map[bool]string{false: "0", true: "1"}[x], Num: true}
	case time.Time:
		return dataCell{Text: x.Format(time.RFC3339)}
	case []byte:
		if utf8.Valid(x) {
			return cutText(string(x))
		}
		return dataCell{Text: fmt.Sprintf("<%s bytes>", commas(int64(len(x)))), Null: true}
	case string:
		return cutText(x)
	}
	return cutText(fmt.Sprint(v))
}

// value: the whole value, as a filter on it says it
func (c dataCell) value() string {
	if c.Title != "" {
		return c.Title
	}
	return c.Text
}

func cutText(s string) dataCell {
	if utf8.RuneCountInString(s) <= dataCellMax {
		return dataCell{Text: s}
	}
	return dataCell{Text: string([]rune(s)[:dataCellMax]) + "…", Title: s}
}
