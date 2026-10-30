package main

// The App's side of the party file (store.go): opening it at start, the
// passcode screen while it's sealed, and the Party menu's encryption.
// While it's locked the app is only the passcode field: nothing hosts, nothing
// is added, and the list isn't known.

import (
	"encoding/json"
	"errors"
	"os"
	"time"

	"github.com/wailsapp/wails/v2/pkg/menu"
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
		a.cfg = cfg
		a.selected = -1
		a.save()
		a.scanSubtitles()
	})
	return result
}

// ask: the Party menu's items ask the window for a passcode (mode "on", "change" or "off"), or show the settings ("settings")
func (a *App) ask(mode string) {
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "ask", mode)
	}
}

// menu: the Mac's menu bar, with the Party menu
func (a *App) menu() *menu.Menu {
	m := menu.NewMenu()
	m.Append(menu.AppMenu())
	party := m.AddSubmenu("Party")
	settings := party.AddText("Settings…", nil, func(*menu.CallbackData) { a.ask("settings") })
	settings.Disabled = a.locked
	party.AddSeparator()
	switch {
	case a.locked || a.party == nil:
		party.AddText("Use Encryption…", nil, nil).Disabled = true
	case a.party.sealed:
		party.AddCheckbox("Encryption Is On", true, nil, nil).Disabled = true
		party.AddText("Change Passcode…", nil, func(*menu.CallbackData) { a.ask("change") })
		party.AddText("Stop Using Encryption…", nil, func(*menu.CallbackData) { a.ask("off") })
	default:
		party.AddText("Use Encryption…", nil, func(*menu.CallbackData) { a.ask("on") })
	}
	m.Append(menu.EditMenu())
	m.Append(menu.WindowMenu())
	return m
}

// setMenu shows the Party menu as things are now
func (a *App) setMenu() {
	if a.ctx != nil {
		runtime.MenuSetApplicationMenu(a.ctx, a.menu())
		runtime.MenuUpdateApplicationMenu(a.ctx)
	}
}
