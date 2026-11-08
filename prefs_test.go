package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The Settings window: the settings as they are, changed one at a time and kept, refused out of
// range (nothing changing then); the accounts listed without their passwords, added by a site's
// name or a link to it, replaced, removed; and the login the Add Download Link sheet fills in.
func TestPrefs(t *testing.T) {
	t.Setenv("HOME", t.TempDir()) // never the real party file
	t.Setenv("XDG_CACHE_HOME", "")
	a := NewApp(standby)
	go a.run()
	defer a.shutdown(nil)

	p := a.Prefs()
	if p.Countdown != 10 || p.Bitrate != 2500 || p.Preset != "veryfast" || p.CacheGB != 20 || !p.OpenRouterPorts || p.Sealed || len(p.Accounts) != 0 {
		t.Fatalf("the defaults: %+v", p)
	}
	p.Countdown, p.Bitrate, p.Preset, p.CacheGB, p.OpenRouterPorts, p.Skip = 3, 4000, "fast", 50, false, 2
	if why := a.SetPrefs(p); why != "" {
		t.Fatal(why)
	}
	a.wait(func() {
		if c := a.cfg; c.Countdown != 3 || c.Bitrate != "4000k" || c.Preset != "fast" || c.CacheGB != 50 || c.OpenRouterPorts || c.Skip != 2 {
			t.Errorf("kept: %+v", c)
		}
	})
	if got := a.Prefs(); got.Bitrate != 4000 || got.Countdown != 3 {
		t.Errorf("read back: %+v", got)
	}
	for _, bad := range []func(p *Prefs){
		func(p *Prefs) { p.Countdown = -1 }, func(p *Prefs) { p.Bitrate = 10 }, func(p *Prefs) { p.Preset = "placebo" },
		func(p *Prefs) { p.CacheGB = -2 }, func(p *Prefs) { p.Skip = 9000 },
	} {
		q := a.Prefs()
		bad(&q)
		if why := a.SetPrefs(q); why == "" {
			t.Errorf("taken: %+v", q)
		}
	}
	if got := a.Prefs(); got.Countdown != 3 || got.Preset != "fast" {
		t.Errorf("a refused change changed something: %+v", got)
	}
	for in, want := range map[string]int{"1500k": 1500, "2M": 2000, "800000": 800, "2.5m": 2500, "": 0} {
		if got := kbps(in); got != want {
			t.Errorf("kbps(%q) = %d, not %d", in, got, want)
		}
	}
	// a bandwidth is one of the choices: one set otherwise (by hand, or before there were choices) is the nearest
	for in, want := range map[int]int{2000: 2500, 1000: 800, 1600: 1500, 99999: 6000, 0: 2500, 4000: 4000} {
		if got := nearestBitrate(in); got != want {
			t.Errorf("nearestBitrate(%d) = %d, not %d", in, got, want)
		}
	}
	q := a.Prefs()
	q.Bitrate = 2000
	if why := a.SetPrefs(q); !strings.Contains(why, "bandwidth") {
		t.Errorf("a bandwidth not offered: %q", why)
	}
	if c := loadConfig(nil); c.Bitrate != "2500k" {
		t.Errorf("the default bandwidth: %s", c.Bitrate)
	}

	// accounts
	for _, bad := range [][2]string{{"", "ann"}, {"nothing", "ann"}, {"example.com", " "}} {
		if why := a.SaveAccount(bad[0], bad[1], "pw"); why == "" {
			t.Errorf("SaveAccount(%q, %q) taken", bad[0], bad[1])
		}
	}
	if why := a.SaveAccount("https://members.example.com/dl/x.mkv?sig=1", " ann ", "s3cret"); why != "" {
		t.Fatal(why)
	}
	if why := a.SaveAccount("other.org", "bob", "pw"); why != "" {
		t.Fatal(why)
	}
	if why := a.SaveAccount("www.example.com", "ann2", "n3w"); why != "" { // the same site: replaced
		t.Fatal(why)
	}
	got := a.Prefs().Accounts
	if len(got) != 2 || got[0] != (Account{"example.com", "ann2"}) || got[1] != (Account{"other.org", "bob"}) {
		t.Fatalf("accounts: %+v", got)
	}
	if ll := a.LoginFor("https://cdn.example.com/a/b.mkv"); ll != (LinkLogin{Site: "example.com", User: "ann2", Pass: "n3w", Saved: true}) {
		t.Errorf("LoginFor a saved site: %+v", ll)
	}
	if ll := a.LoginFor("https://zed:pw@nowhere.net/x.mkv"); ll != (LinkLogin{Site: "nowhere.net", User: "zed", Pass: "pw"}) {
		t.Errorf("LoginFor a link with its login in it: %+v", ll)
	}
	if ll := a.LoginFor("https://nowhere.net/x.mkv"); ll != (LinkLogin{Site: "nowhere.net"}) {
		t.Errorf("LoginFor a site with none: %+v", ll)
	}
	if ll := a.LoginFor("not a link"); ll != (LinkLogin{}) {
		t.Errorf("LoginFor no link: %+v", ll)
	}
	if why := a.RemoveAccount("other.org"); why != "" {
		t.Fatal(why)
	}
	if got := a.Prefs().Accounts; len(got) != 1 || got[0].Site != "example.com" {
		t.Errorf("after removing: %+v", got)
	}
	if text := a.SettingsText(); strings.Contains(text, "n3w") || strings.Contains(text, "ann2") {
		t.Error("a login is in the Settings text")
	}
}

// Clear Played Files: the rows above the one next to play go, a file of one's own staying where it is; the
// one next to play stays next; with nothing played, nothing changes. Edit > Undo puts them back where they
// were, played still, and Redo takes them out again; a download's file stays while they can come back,
// and goes once they can't
func TestClearPlayed(t *testing.T) {
	t.Setenv("HOME", t.TempDir()) // never the real party file, nor the real cache
	t.Setenv("XDG_CACHE_HOME", "")
	dir := t.TempDir()
	mine := filepath.Join(dir, "Mine.mkv")
	os.WriteFile(mine, []byte("x"), 0o644)
	got := filepath.Join(downloadsDir(), downloadKey("https://example.com/Got.mkv"), "Got.mkv")
	os.MkdirAll(filepath.Dir(got), 0o755)
	os.WriteFile(got, []byte("x"), 0o644)
	a := NewApp(standby)
	go a.run()
	defer a.shutdown(nil)
	next := &Item{Path: filepath.Join(dir, "Next.mkv")}
	a.wait(func() {
		a.cfg.Queue = []*Item{{Path: mine}, {Path: got, URL: "https://example.com/Got.mkv", Got: true}, next, {Path: filepath.Join(dir, "Last.mkv")}}
		a.cfg.Position, a.selected = 2, 1
	})
	a.ClearPlayed()
	a.wait(func() {
		if len(a.cfg.Queue) != 2 || a.cfg.Queue[0] != next || a.cfg.Position != 0 || a.selected != -1 {
			t.Errorf("after: %d rows, position %d, selected %d", len(a.cfg.Queue), a.cfg.Position, a.selected)
		}
	})
	if _, err := os.Stat(mine); err != nil {
		t.Error("a file of one's own went:", err)
	}
	if _, err := os.Stat(got); err != nil {
		t.Error("the played download went while it could come back:", err)
	}
	a.UndoRemove()
	a.wait(func() {
		if len(a.cfg.Queue) != 4 || a.cfg.Queue[0].Path != mine || a.cfg.Queue[1].Path != got || a.cfg.Queue[2] != next || a.cfg.Position != 2 {
			t.Errorf("undone: %d rows, position %d", len(a.cfg.Queue), a.cfg.Position)
		}
		if a.undo != nil || a.redo == nil || a.redo.name != "Clear Played Files" {
			t.Errorf("undone, undo %v, redo %v", a.undo, a.redo)
		}
	})
	a.RedoRemove()
	a.wait(func() {
		if len(a.cfg.Queue) != 2 || a.cfg.Queue[0] != next || a.cfg.Position != 0 || a.undo == nil {
			t.Errorf("redone: %d rows, position %d", len(a.cfg.Queue), a.cfg.Position)
		}
	})
	a.ClearPlayed() // nothing played now
	a.wait(func() {
		if len(a.cfg.Queue) != 2 || a.cfg.Position != 0 || a.undo == nil {
			t.Errorf("nothing played, yet: %d rows, position %d", len(a.cfg.Queue), a.cfg.Position)
		}
		a.forget()
	})
	if _, err := os.Stat(filepath.Dir(got)); !os.IsNotExist(err) {
		t.Error("the played download's folder is still there, past undoing:", err)
	}
}

// Backspace with nothing playing, everything played: undone, the row comes back played; the one
// unplayed row taken out of a list played to its end comes back to play next
func TestUndoRemove(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CACHE_HOME", "")
	a := NewApp(standby)
	go a.run()
	defer a.shutdown(nil)
	one, two := &Item{Path: "/nowhere/One.mkv"}, &Item{Path: "/nowhere/Two.mkv"}
	a.wait(func() {
		a.cfg.Queue, a.cfg.Position, a.selected = []*Item{one, two}, 2, 0
		a.remove()
		if len(a.cfg.Queue) != 1 || a.cfg.Position != 1 || a.undo.name != "Remove" {
			t.Errorf("removed: %d rows, position %d", len(a.cfg.Queue), a.cfg.Position)
		}
		a.undoRemove()
		if len(a.cfg.Queue) != 2 || a.cfg.Queue[0] != one || a.cfg.Position != 2 || a.selected != 0 {
			t.Errorf("undone: %d rows, position %d, selected %d", len(a.cfg.Queue), a.cfg.Position, a.selected)
		}
		a.cfg.Queue, a.cfg.Position, a.selected = []*Item{one, two}, 1, 1
		a.remove() // the one next to play, the last
		a.undoRemove()
		if len(a.cfg.Queue) != 2 || a.cfg.Queue[1] != two || a.cfg.Position != 1 {
			t.Errorf("next one undone: %d rows, position %d", len(a.cfg.Queue), a.cfg.Position)
		}
		a.undoRemove() // nothing to undo: nothing happens
		if len(a.cfg.Queue) != 2 {
			t.Errorf("undoing nothing: %d rows", len(a.cfg.Queue))
		}
	})
}
