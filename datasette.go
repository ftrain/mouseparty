package main

// A SQLite database up, looked through together with Datasette: the real one,
// run by CPython built for WebAssembly (scripts/build_python.sh) under wazero
// (wasm.go), one for each database while it's up. It sees its own files and a
// folder holding the database and nothing else, both read-only, and opens the
// database immutable, so nothing is written, locked or journalled; it has no
// network and no other file on the Mac to reach. The host is its web server:
// /data/<token>/... goes to it as a line of JSON (datasette.py), one request at
// a time, and its answer comes back the same way, under the session key like
// everything else. The file itself is never sent (allow_download is off).
//
// Its pages are in a frame over the video (host.js). A script added to each
// tells the frame's parent where it is ({type: 'went', at}), which tells
// everyone, and follows where everyone is ({type: 'go', at, back}); Back, the
// page before, is everyone's (session.go SetAt).

import (
	"bufio"
	"bytes"
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/tetratelabs/wazero"
)

//go:embed datasette.py
var datasettePy string

const (
	datasetteStart  = 2 * time.Minute  // Python compiled the first time (seconds, then cached: wasm.go), Datasette starting
	datasetteAnswer = 20 * time.Second // any one page (its SQL stops at 3: datasette.py)
)

var datasetteMark = []byte("\x00MP ")

// pythonHome: the WebAssembly Python and its libraries, in the app (Contents/Resources/python) or where
// scripts/build_python.sh puts them; "" when this build has none
func pythonHome() string {
	for _, d := range []string{filepath.Join(bundledBin(), "..", "python"), filepath.Join("build", "python", "dist")} {
		if st, err := os.Stat(filepath.Join(d, "python.wasm")); err == nil && !st.IsDir() {
			abs, _ := filepath.Abs(d)
			return abs
		}
	}
	return ""
}

type datasette struct {
	mu     sync.Mutex // one request at a time
	in     *io.PipeWriter
	out    *bufio.Reader
	cancel context.CancelFunc
	ready  chan struct{} // closed once it answers
	gone   chan struct{} // closed when it has stopped
	err    error         // why it stopped
	log    func(string)
}

// startDatasette runs Datasette on the database at path, its pages under base ("/<key>/data/<token>/")
func startDatasette(py *wasmTool, home, path, title, base string, log func(string)) *datasette {
	ctx, cancel := context.WithCancel(context.Background())
	inR, inW := io.Pipe()
	outR, outW := io.Pipe()
	d := &datasette{in: inW, out: bufio.NewReaderSize(outR, 1<<20), cancel: cancel, ready: make(chan struct{}), gone: make(chan struct{}), log: log}
	only := onlyFile{dir: filepath.Dir(path), name: filepath.Base(path)}
	name := only.seen()
	fsc := wazero.NewFSConfig().
		WithReadOnlyDirMount(home, "/").
		WithFSMount(only, "/data")
	env := map[string]string{"PYTHONHOME": "/", "PYTHONPATH": "/site", "PYTHONDONTWRITEBYTECODE": "1", "HOME": "/"}
	stderr := &lineLog{log: log, prefix: "Datasette: "}
	go func() {
		err := py.runWith(ctx, fsc, env, inR, outW, stderr, "-P", "-c", datasettePy, "/data/"+name, title, base)
		if err == nil {
			err = errors.New("it stopped")
		}
		d.err = err
		outW.CloseWithError(err)
		close(d.gone)
	}()
	go func() {
		if b, err := d.next(); err == nil && bytes.Contains(b, []byte(`"ready"`)) {
			close(d.ready)
		}
	}()
	return d
}

// next: its next answer, past anything else it printed
func (d *datasette) next() ([]byte, error) {
	for {
		line, err := d.out.ReadBytes('\n')
		if b, ok := bytes.CutPrefix(line, datasetteMark); ok {
			return b, nil
		}
		if err != nil {
			return nil, err
		}
		if s := strings.TrimSpace(string(line)); s != "" && d.log != nil {
			d.log("Datasette said: " + s)
		}
	}
}

func (d *datasette) stop() {
	if d == nil {
		return
	}
	d.cancel()
	d.in.Close()
}

type datasetteAnswerMsg struct {
	Status  int         `json:"status"`
	Headers [][2]string `json:"headers"`
	Body    string      `json:"body"`
}

// ask: one request, and its answer
func (d *datasette) ask(method, path, query string, headers [][2]string) (*datasetteAnswerMsg, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	select {
	case <-d.ready:
	case <-d.gone:
		return nil, d.err
	case <-time.After(datasetteStart):
		return nil, errors.New("it didn't start in time")
	}
	if headers == nil {
		headers = [][2]string{}
	}
	line, _ := json.Marshal(map[string]any{"method": method, "path": path, "query": query, "headers": headers})
	got := make(chan error, 1)
	var a datasetteAnswerMsg
	go func() {
		if _, err := d.in.Write(append(line, '\n')); err != nil {
			got <- err
			return
		}
		b, err := d.next()
		if err == nil {
			err = json.Unmarshal(b, &a)
		}
		got <- err
	}()
	select {
	case err := <-got:
		return &a, err
	case <-time.After(datasetteAnswer):
		d.stop() // it's stuck: the next request starts another (session.go)
		return nil, errors.New("it took too long")
	}
}

// the script added to each of its pages: where it is, told to the page around it; where everyone is, followed; Back
const datasetteFollow = `<script>
(() => { // Mouse Party (datasette.go): everyone on the same page of the database
    const base = %s;
    const at = '/' + location.pathname.slice(base.length) + location.search;
    if (parent === window) return;
    parent.postMessage({ type: 'went', at }, location.origin);
    const back = document.createElement('button');
    back.textContent = '← Back';
    back.title = 'Back to the page before (for everyone)';
    back.disabled = true;
    back.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;font:13px system-ui;padding:4px 10px;border-radius:6px;border:1px solid #888;background:#fff;cursor:pointer';
    back.onclick = () => parent.postMessage({ type: 'back' }, location.origin);
    document.body.append(back);
    window.addEventListener('message', (e) => {
        if (e.origin !== location.origin || e.source !== parent || e.data?.type !== 'go') return;
        back.disabled = !e.data.back;
        if (typeof e.data.at === 'string' && e.data.at.startsWith('/') && e.data.at !== at) location.replace(base + e.data.at.slice(1));
    });
})();
</script>`

// datasettePage: a page of the database up, from its Datasette
func (h *Host) datasettePage(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	d, doc := h.datasette, h.doc
	h.mu.Unlock()
	if doc == nil || doc.Kind != "db" || r.PathValue("token") != doc.Token {
		http.NotFound(w, r)
		return
	}
	if d == nil {
		http.Error(w, "Databases are looked through with Datasette, and this build of Mouse Party has no Python for it (scripts/build_python.sh).", http.StatusServiceUnavailable)
		return
	}
	var headers [][2]string
	for _, k := range []string{"Accept", "Accept-Language", "Cookie", "User-Agent"} {
		if v := r.Header.Get(k); v != "" {
			headers = append(headers, [2]string{k, v})
		}
	}
	a, err := d.ask(r.Method, r.URL.Path, r.URL.RawQuery, headers)
	if err != nil {
		h.restartDatasette(d)
		http.Error(w, "Datasette couldn't answer: "+err.Error(), http.StatusBadGateway)
		return
	}
	body, err := base64.StdEncoding.DecodeString(a.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	html := false
	for _, kv := range a.Headers {
		switch strings.ToLower(kv[0]) {
		case "content-length", "transfer-encoding", "connection":
			continue
		case "content-type":
			html = strings.HasPrefix(kv[1], "text/html")
		}
		w.Header().Add(kv[0], kv[1])
	}
	if html {
		base, _ := json.Marshal("/" + r.PathValue("key") + "/data/" + doc.Token + "/")
		script := []byte(fmt.Sprintf(datasetteFollow, base))
		if i := bytes.LastIndex(body, []byte("</body>")); i >= 0 {
			body = append(body[:i:i], append(script, body[i:]...)...)
		} else {
			body = append(body, script...)
		}
	}
	w.WriteHeader(a.Status)
	w.Write(body)
}

// restartDatasette: one that stopped (stuck, or broken) is started again, for the same database, if it's still up
func (h *Host) restartDatasette(old *datasette) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.datasette != old || h.doc == nil {
		return
	}
	select {
	case <-old.gone:
	default:
		old.stop()
	}
	h.datasette = startDatasette(h.python, pythonHome(), h.doc.Path, h.doc.Title, h.datasetteBase(h.doc), h.Log)
}

func (h *Host) datasetteBase(d *document) string { return "/" + h.key + "/data/" + d.Token + "/" }

// ---------- what it sees ----------

// onlyFile: a folder holding one file, read-only: all Python sees of the database's folder
type onlyFile struct{ dir, name string }

// seen: the file's name as Python sees it. Datasette opens it as a SQLite URI
// (file:<path>?immutable=1), where ?, # and % mean something, and a name with
// one of them in can't be opened ("unable to open database file").
func (o onlyFile) seen() string {
	return strings.NewReplacer("?", "_", "#", "_", "%", "_").Replace(o.name)
}

func (o onlyFile) Open(name string) (fs.File, error) {
	switch name {
	case ".":
		return &oneDir{o}, nil
	case o.seen():
		return os.Open(filepath.Join(o.dir, o.name))
	}
	return nil, &fs.PathError{Op: "open", Path: name, Err: fs.ErrNotExist}
}

type oneDir struct{ o onlyFile }

func (d *oneDir) Stat() (fs.FileInfo, error) { return os.Stat(d.o.dir) }
func (d *oneDir) Read([]byte) (int, error)   { return 0, errors.New("a folder") }
func (d *oneDir) Close() error               { return nil }
func (d *oneDir) ReadDir(int) ([]fs.DirEntry, error) {
	st, err := os.Stat(filepath.Join(d.o.dir, d.o.name))
	if err != nil {
		return nil, err
	}
	return []fs.DirEntry{fs.FileInfoToDirEntry(renamed{st, d.o.seen()})}, nil
}

type renamed struct {
	fs.FileInfo
	name string
}

func (r renamed) Name() string { return r.name }

// lineLog: what a program writes, to the log a line at a time
type lineLog struct {
	log    func(string)
	prefix string
	buf    []byte
}

func (l *lineLog) Write(b []byte) (int, error) {
	l.buf = append(l.buf, b...)
	for {
		i := bytes.IndexByte(l.buf, '\n')
		if i < 0 {
			break
		}
		if s := strings.TrimSpace(string(l.buf[:i])); s != "" && l.log != nil {
			l.log(l.prefix + s)
		}
		l.buf = l.buf[i+1:]
	}
	return len(b), nil
}
