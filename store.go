package main

// The party: everything the app keeps, in one SQLite file,
// ~/Library/Application Support/Mouse Party/party.sqlite (docs/one-file.md):
// the settings and the list (paths to the films and songs, never the files),
// what apps keep (apps.Shelf: the documents, Graffiti's wall, the reel, the last
// poll), and the pictures documents name. Nothing about a session goes in: not
// the link, not who came, not chat.
//
// With a passcode it's sealed: every page of the file encrypted by the
// adiantum VFS (Adiantum, the key from the passcode by Argon2id), so it reads as
// noise without it. That keeps it private, not tamper-proof, and two copies of
// it show which pages changed (its README says both). SQLite is ncruces's: the
// real SQLite, compiled to WebAssembly and translated to Go, so there's no cgo.
// One connection, its calls one at a time.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/ncruces/go-sqlite3"
	_ "github.com/ncruces/go-sqlite3/vfs/adiantum"
)

var errPasscode = errors.New("that's not the passcode")

const partySchema = `
CREATE TABLE IF NOT EXISTS meta     (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value BLOB);
CREATE TABLE IF NOT EXISTS kept     (name TEXT PRIMARY KEY, value BLOB, saved REAL);
CREATE TABLE IF NOT EXISTS pictures (id TEXT PRIMARY KEY, mime TEXT, bytes BLOB, added REAL);`

type party struct {
	mu     sync.Mutex
	path   string
	conn   *sqlite3.Conn
	sealed bool
}

func partyPath() string { return filepath.Join(dataDir(), "party.sqlite") }

// partySealed: a file there that isn't plain SQLite (whose first bytes say so) is sealed
func partySealed(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	head := make([]byte, 16)
	n, _ := f.Read(head)
	return n > 0 && !bytes.Equal(head[:n], []byte("SQLite format 3\x00")[:n])
}

// openParty opens the party at path, making it if there's none (passcode "" for a plain one)
func openParty(path, passcode string) (*party, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	p := &party{path: path, sealed: passcode != ""}
	name := path
	if p.sealed {
		name = "file:" + uriEscape(path) + "?vfs=adiantum"
	}
	conn, err := sqlite3.Open(name)
	if err != nil {
		return nil, err
	}
	setup := "PRAGMA temp_store = memory; PRAGMA journal_mode = DELETE;" // never a file beside it
	if p.sealed {
		setup = "PRAGMA textkey = '" + strings.ReplaceAll(passcode, "'", "''") + "';" + setup
	}
	if err := conn.Exec(setup); err != nil {
		conn.Close()
		if p.sealed {
			return nil, errPasscode
		}
		return nil, err
	}
	if err := conn.Exec(partySchema); err != nil {
		conn.Close()
		if errors.Is(err, sqlite3.NOTADB) {
			return nil, errPasscode
		}
		return nil, err
	}
	p.conn = conn
	p.exec(`INSERT OR IGNORE INTO meta VALUES ('created', ?)`, time.Now().UTC().Format(time.RFC3339))
	return p, nil
}

func (p *party) close() {
	if p == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.conn != nil {
		p.conn.Close()
		p.conn = nil
	}
}

// exec runs one statement with its arguments (strings, []byte, float64, int)
func (p *party) exec(sql string, args ...any) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.conn == nil {
		return errors.New("the party is closed")
	}
	st, _, err := p.conn.Prepare(sql)
	if err != nil {
		return err
	}
	defer st.Close()
	bind(st, args)
	return st.Exec()
}

// one: the first column of the first row, and whether there was one
func (p *party) one(sql string, args ...any) ([]byte, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.conn == nil {
		return nil, false
	}
	st, _, err := p.conn.Prepare(sql)
	if err != nil {
		return nil, false
	}
	defer st.Close()
	bind(st, args)
	if !st.Step() {
		return nil, false
	}
	return st.ColumnBlob(0, nil), true
}

func bind(st *sqlite3.Stmt, args []any) {
	for i, a := range args {
		switch v := a.(type) {
		case string:
			st.BindText(i+1, v)
		case []byte:
			st.BindBlob(i+1, v)
		case float64:
			st.BindFloat(i+1, v)
		case int:
			st.BindInt64(i+1, int64(v))
		}
	}
}

func now() float64 { return float64(time.Now().UnixMilli()) / 1000 }

// ---------- what's in it ----------

// setting: one of the settings, as JSON ("config": the whole Config)
func (p *party) setting(key string) ([]byte, bool) {
	return p.one(`SELECT value FROM settings WHERE key = ?`, key)
}
func (p *party) setSetting(key string, b []byte) error {
	return p.exec(`INSERT OR REPLACE INTO settings VALUES (?, ?)`, key, b)
}

// Load and Save make the party an apps.Shelf: what an app (or the reel) keeps, by name
func (p *party) Load(name string) ([]byte, bool) {
	return p.one(`SELECT value FROM kept WHERE name = ?`, name)
}
func (p *party) Save(name string, b []byte) error {
	return p.exec(`INSERT OR REPLACE INTO kept VALUES (?, ?, ?)`, name, b, now())
}

func (p *party) putPicture(id, mime string, b []byte) error {
	return p.exec(`INSERT OR IGNORE INTO pictures VALUES (?, ?, ?, ?)`, id, mime, b, now())
}

func (p *party) picture(id string) (picture, bool) {
	mime, ok := p.one(`SELECT mime FROM pictures WHERE id = ?`, id)
	if !ok {
		return picture{}, false
	}
	b, ok := p.one(`SELECT bytes FROM pictures WHERE id = ?`, id)
	return picture{string(mime), b}, ok
}

// prunePictures: the pictures nothing kept names any more go (as hosting starts)
func (p *party) prunePictures() {
	named := map[string]bool{}
	p.mu.Lock()
	if p.conn == nil {
		p.mu.Unlock()
		return
	}
	var ids []string
	if st, _, err := p.conn.Prepare(`SELECT value FROM kept`); err == nil {
		for st.Step() {
			for _, m := range assetRef.FindAllSubmatch(st.ColumnRawBlob(0), -1) {
				named[string(m[1])] = true
			}
		}
		st.Close()
	}
	if st, _, err := p.conn.Prepare(`SELECT id FROM pictures`); err == nil {
		for st.Step() {
			if id := st.ColumnText(0); !named[id] {
				ids = append(ids, id)
			}
		}
		st.Close()
	}
	p.mu.Unlock()
	for _, id := range ids {
		p.exec(`DELETE FROM pictures WHERE id = ?`, id)
	}
	if len(ids) > 0 {
		p.exec(`VACUUM`) // the space they took, and what was in it, gone from the file
	}
}

// ---------- sealing ----------

// reseal writes the party again sealed with passcode ("" for plain), in place:
// a copy made whole beside it, then put over it, then opened
func (p *party) reseal(passcode string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.conn == nil {
		return errors.New("the party is closed")
	}
	tmp := p.path + ".new"
	os.Remove(tmp)
	into := "file:" + uriEscape(tmp) + "?vfs=os"
	if passcode != "" {
		into = "file:" + uriEscape(tmp) + "?vfs=adiantum&textkey=" + uriEscape(passcode)
	}
	if err := p.conn.Exec(`VACUUM INTO '` + strings.ReplaceAll(into, "'", "''") + `'`); err != nil {
		os.Remove(tmp)
		return err
	}
	if f, err := os.Open(tmp); err == nil {
		f.Sync()
		f.Close()
	}
	p.conn.Close()
	p.conn = nil
	if err := os.Rename(tmp, p.path); err != nil {
		os.Remove(tmp)
		return err
	}
	next, err := openParty(p.path, passcode)
	if err != nil {
		return err
	}
	p.conn, p.sealed = next.conn, next.sealed
	return nil
}

// uriEscape: every byte but letters and digits as %XX (SQLite's URIs don't read '+' as a space)
func uriEscape(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		if c >= '0' && c <= '9' || c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c == '/' || c == '.' || c == '-' || c == '_' {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

// setAside moves a sealed party whose passcode is lost out of the way (never deleted), for a new one
func setAside(path string) (string, error) {
	aside := strings.TrimSuffix(path, ".sqlite") + " (locked " + time.Now().Format("2006-01-02 15.04") + ").sqlite"
	return aside, os.Rename(path, aside)
}

// ---------- what came before ----------

// importOld copies in what Open House Party kept as files (settings.json,
// apps/*.json, the reel, pictures/) the first time the party is made, then
// renames that folder so it's plain it was copied (it's left for its owner)
func (p *party) importOld(old string) error {
	if st, err := os.Stat(old); err != nil || !st.IsDir() {
		return nil
	}
	if b, err := os.ReadFile(filepath.Join(old, "settings.json")); err == nil && json.Valid(b) {
		p.setSetting("config", b)
	}
	kept, _ := filepath.Glob(filepath.Join(old, "apps", "*.json"))
	for _, f := range kept {
		if b, err := os.ReadFile(f); err == nil && json.Valid(b) {
			p.Save(strings.TrimSuffix(filepath.Base(f), ".json"), b)
		}
	}
	pics, _ := filepath.Glob(filepath.Join(old, "pictures", "*"))
	for _, f := range pics {
		id := strings.TrimSuffix(filepath.Base(f), filepath.Ext(f))
		b, err := os.ReadFile(f)
		if err != nil || !pictureID.MatchString(id) {
			continue
		}
		mime := "image/svg+xml"
		for m, ext := range pictureTypes {
			if filepath.Ext(f) == ext {
				mime = m
			}
		}
		p.putPicture(id, mime, b)
	}
	return os.Rename(old, old+" (copied into Mouse Party)")
}

// oldDataDir: where Open House Party kept things
func oldDataDir() string {
	dir, _ := os.UserConfigDir()
	return filepath.Join(dir, "Open House Party")
}
