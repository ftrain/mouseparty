package main

// The App's side of the party file (store.go): opening it at start, the
// passcode screen while it's sealed, and the Party menu's encryption.
// While it's locked the app is only the passcode field: nothing hosts, nothing
// is added, and the list isn't known.

import (
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// openTheParty: the party file, opened if it's plain; sealed, the app starts locked.
// A new one takes in what Open House Party kept as files.
func openTheParty(log func(string)) (p *party, locked bool) {
	path := partyPath()
	if partySealed(path) {
		return nil, true
	}
	_, err := os.Stat(path)
	made := errors.Is(err, os.ErrNotExist)
	p, err = openParty(path, "")
	if err != nil {
		log("The party file won't open (" + err.Error() + "); nothing will be kept this time.")
		return nil, false
	}
	if made {
		if err := p.importOld(oldDataDir()); err != nil {
			log("Couldn't take in Open House Party's files: " + err.Error())
		}
	}
	return p, false
}

// Unlock opens the sealed party with the passcode typed at startup; "" or why not
func (a *App) Unlock(passcode string) string {
	var wait time.Duration
	a.wait(func() { wait = a.unlockWait })
	time.Sleep(wait) // each wrong one makes the next wait longer
	p, err := openParty(partyPath(), passcode)
	result := ""
	a.wait(func() {
		if err != nil {
			a.unlockWait = min(max(2*a.unlockWait, 500*time.Millisecond), 30*time.Second)
			result = err.Error()
			return
		}
		a.unlockWait = 0
		a.opened(p)
	})
	return result
}

// StartOver sets a sealed party whose passcode is lost aside (never deleted) and starts a new one
func (a *App) StartOver() string {
	result := ""
	a.wait(func() {
		if !a.locked {
			return
		}
		aside, err := setAside(partyPath())
		if err != nil {
			result = err.Error()
			return
		}
		a.log("The locked party is kept as " + aside)
		p, err := openParty(partyPath(), "")
		if err != nil {
			result = err.Error()
			return
		}
		a.opened(p)
	})
	return result
}

// EraseAll: Party > Erase All Data…: everything Mouse Party keeps from one time to the next is
// deleted (the party file, with the list, settings, logins, what apps kept and pictures; anything set
// aside; the download cache; Open House Party's old folder), and the app quits and opens again,
// empty, as the first time. Media files dropped into the list are the owner's and stay. "" or why not
func (a *App) EraseAll() string {
	result := ""
	a.wait(func() {
		if a.locked {
			result = "The party is sealed: open it first, or start over"
			return
		}
		a.erased = true // from here on nothing is saved, at quitting either
		a.player.Stop()
		for _, it := range a.cfg.Queue {
			a.stopDownload(it)
		}
		if a.host != nil {
			a.host.Stop() // apps keep what they hold as they close: into the file about to go
			a.host = nil
		}
		a.party.close()
		a.party = nil
		for _, dir := range erasable() {
			if err := os.RemoveAll(dir); err != nil {
				result = err.Error()
			}
		}
		a.log("Everything Mouse Party kept is erased.")
	})
	if result == "" && a.ctx != nil {
		runtime.Quit(a.ctx) // shutdown opens it again (erased)
	}
	return result
}

// erasable: every folder of Mouse Party's own data, deleted by Erase All Data
func erasable() []string {
	dirs := []string{dataDir(), oldDataDir(), oldDataDir() + " (copied into Mouse Party)"}
	if d, err := os.UserCacheDir(); err == nil {
		dirs = append(dirs, filepath.Join(d, "Mouse Party"))
	}
	return dirs
}

// afterErase: once this process has gone, what it couldn't delete while it ran (its window's
// place and the web view's own storage, which AppKit and WebKit write as it quits), then the app
// opened again, if it's an app (bundle "": wails dev, only the deleting)
func afterErase(bundle string) {
	const id = "io.github.ftrain.mouseparty" // packaging/darwin/Info.plist
	home, _ := os.UserHomeDir()
	lib := filepath.Join(home, "Library")
	var paths []string
	for _, p := range []string{"WebKit/" + id, "Caches/" + id, "HTTPStorages/" + id, "HTTPStorages/" + id + ".binarycookies",
		"Saved Application State/" + id + ".savedState"} {
		paths = append(paths, filepath.Join(lib, p))
	}
	paths = append(paths, erasable()...)
	script := `while kill -0 "$0" 2>/dev/null; do sleep 0.2; done
/usr/bin/defaults delete "$1" 2>/dev/null
shift 2
bundle=$1; shift
rm -rf "$@"
[ -n "$bundle" ] && exec /usr/bin/open "$bundle"`
	cmd := exec.Command("/bin/sh", append([]string{"-c", script, strconv.Itoa(os.Getpid()), id, bundle}, paths...)...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true} // not stopped with us
	cmd.Start()
}

// opened: the party is open; what was waiting on it starts (with a.locked still set while it does)
func (a *App) opened(p *party) {
	a.party, a.cfg = p, loadConfig(p)
	a.locked = false
	a.setMenu()
	a.started()
}

// SetPasscode turns encryption on (current ""), changes the passcode, or turns it off (next ""); "" or why not
func (a *App) SetPasscode(current, next string) string {
	result := ""
	a.wait(func() {
		switch {
		case a.party == nil:
			result = "Nothing is being kept, so there's nothing to seal"
		case a.party.sealed && !a.passcodeIs(current):
			result = errPasscode.Error()
		default:
			a.save()
			if err := a.party.reseal(next); err != nil {
				result = err.Error()
			}
			a.setMenu()
		}
	})
	return result
}

// passcodeIs: whether the party opens with it (a second, short-lived connection)
func (a *App) passcodeIs(passcode string) bool {
	p, err := openParty(partyPath(), passcode)
	if err != nil {
		return false
	}
	p.close()
	return true
}

// SettingsText: the settings and the list as JSON, as settings.json used to hold them (Party > Settings…)
func (a *App) SettingsText() string {
	var b []byte
	a.wait(func() { b, _ = json.MarshalIndent(a.cfg, "", "  ") })
	return string(b)
}

// SetSettingsText takes the settings back as edited; "" or why not (nothing changes then)
func (a *App) SetSettingsText(text string) string {
	cfg := loadConfig(nil)
	if err := json.Unmarshal([]byte(text), cfg); err != nil {
		return "That isn't JSON the settings can read: " + err.Error()
	}
	if cfg.Queue == nil {
		cfg.Queue = []*Item{}
	}
	result := ""
	a.wait(func() {
		if a.playing {
			result = "Stop first: the settings change between movies"
			return
		}
		cfg.Position = max(0, min(cfg.Position, len(cfg.Queue)))
		for _, it := range a.cfg.Queue {
			a.stopDownload(it) // the new list's rows are new: their downloads start afresh (syncDownloads)
		}
		a.cfg = cfg
		a.forget() // the rows that could have come back are another list's
		a.selected = -1
		a.save()
		a.syncDownloads()
		a.trimCache(a.cacheLimit())
		a.scanSubtitles()
	})
	return result
}

// ask: the Party menu's items ask the window for a passcode (mode "on", "change" or "off"), show the
// settings ("settings"), ask for a download link ("link"), or ask before clearing the download cache ("clear")
func (a *App) ask(mode string) {
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "ask", mode)
	}
}
