package main

// The parts of a Mac app around the window: the menu bar (the app menu our own, so Settings…
// and Check for Updates… are where a Mac app has them; Edit's Undo the list's own; a Help
// menu), the About panel, the Dock icon's badge while something downloads, notifications
// while Mouse Party is in the background, and the log, kept in memory for Help > Show Log.

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	helpURL     = "https://github.com/ftrain/mouseparty#readme"
	releasesURL = "https://github.com/ftrain/mouseparty/releases"
	logMax      = 2000 // lines Help > Show Log keeps
)

// menu: the Mac's menu bar
func (a *App) menu() *menu.Menu {
	m := menu.NewMenu()
	cb := func(f func()) menu.Callback { return func(*menu.CallbackData) { f() } }

	app := m.AddSubmenu("Mouse Party") // the first menu is the app's, whatever it's called
	app.AddText("About Mouse Party", nil, cb(a.about))
	if a.update.state == "ready" {
		app.AddText("Restart to Update to "+a.update.latest, nil, cb(func() { go a.RestartToUpdate() }))
	} else {
		app.AddText("Check for Updates…", nil, cb(func() { a.CheckForUpdates(); a.ask("updates") }))
	}
	app.AddSeparator()
	app.AddText("Settings…", keys.CmdOrCtrl(","), cb(func() { a.ask("prefs") })).Disabled = a.locked
	app.AddSeparator()
	app.AddText("Hide Mouse Party", keys.CmdOrCtrl("h"), cb(func() { runtime.Hide(a.ctx) }))
	app.AddText("Hide Others", keys.Combo("h", keys.CmdOrCtrlKey, keys.OptionOrAltKey), cb(nativeHideOthers))
	app.AddText("Show All", nil, cb(nativeShowAll))
	app.AddSeparator()
	app.AddText("Quit Mouse Party", keys.CmdOrCtrl("q"), cb(func() { runtime.Quit(a.ctx) })) // asks first while playing (beforeClose)

	edit := m.AddSubmenu("Edit")
	undo, redo := "Undo", "Redo"
	if a.undo != nil {
		undo = "Undo " + a.undo.name
	}
	if a.redo != nil {
		redo = "Redo " + a.redo.name
	}
	// in a sheet's field, its typing; otherwise the list's removals (the window decides: party.ts)
	edit.AddText(undo, keys.CmdOrCtrl("z"), cb(func() { a.emit("edit", "undo") }))
	edit.AddText(redo, keys.Combo("z", keys.CmdOrCtrlKey, keys.ShiftKey), cb(func() { a.emit("edit", "redo") }))
	edit.AddSeparator()
	for _, e := range []struct{ label, key, action string }{
		{"Cut", "x", "cut:"}, {"Copy", "c", "copy:"}, {"Paste", "v", "paste:"}, {"Select All", "a", "selectAll:"},
	} {
		action := e.action
		edit.AddText(e.label, keys.CmdOrCtrl(e.key), cb(func() { nativeSend(action) }))
	}

	party := m.AddSubmenu("Party")
	party.AddText("Add Download Link…", keys.CmdOrCtrl("l"), cb(func() { a.ask("link") })).Disabled = a.locked
	party.AddText("Clear Played Files", keys.CmdOrCtrl("r"), cb(a.ClearPlayed)).Disabled = a.locked
	party.AddText("Clear Download Cache…", nil, cb(func() { a.ask("clear") })).Disabled = a.locked
	party.AddText("Erase All Data…", nil, cb(func() { a.ask("erase") })).Disabled = a.locked
	party.AddSeparator()
	switch {
	case a.locked || a.party == nil:
		party.AddText("Use Encryption…", nil, nil).Disabled = true
	case a.party.sealed:
		party.AddCheckbox("Encryption Is On", true, nil, nil).Disabled = true
		party.AddText("Change Passcode…", nil, cb(func() { a.ask("change") }))
		party.AddText("Stop Using Encryption…", nil, cb(func() { a.ask("off") }))
	default:
		party.AddText("Use Encryption…", nil, cb(func() { a.ask("on") }))
	}

	m.Append(menu.WindowMenu())

	help := m.AddSubmenu("Help") // macOS adds its search field to a menu called Help
	help.AddText("Mouse Party Help", keys.CmdOrCtrl("?"), cb(func() { runtime.BrowserOpenURL(a.ctx, helpURL) }))
	help.AddText("Keyboard Shortcuts", keys.CmdOrCtrl("/"), cb(func() { a.ask("keys") }))
	help.AddText("Welcome to Mouse Party", nil, cb(func() { a.ask("welcome") }))
	help.AddSeparator()
	help.AddText("Show Log", keys.Combo("l", keys.CmdOrCtrlKey, keys.OptionOrAltKey), cb(func() { a.ask("log") }))
	help.AddText("Release Notes", nil, cb(func() { runtime.BrowserOpenURL(a.ctx, releasesURL) }))
	return m
}

// setMenu shows the menus as things are now
func (a *App) setMenu() {
	if a.ctx != nil {
		runtime.MenuSetApplicationMenu(a.ctx, a.menu())
		runtime.MenuUpdateApplicationMenu(a.ctx)
	}
}

// emit: an event for the window
func (a *App) emit(name string, data ...any) {
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, name, data...)
	}
}

// about: the Mac's own About panel (the icon, the name, the version from Info.plist): who made it, and
// the open source it's made with (licenses/README.md has every one, and its licence)
func (a *App) about() {
	nativeAbout("By Paul Ford\n\n" +
		"Made with FFmpeg, x264, Opus, libass, FreeType, HarfBuzz, FriBidi, MediaMTX, cloudflared, pandoc, " +
		"Python, Datasette, SQLite, Wails, wazero, pdfcpu, hls.js, pdf.js, Tiny Little Office, Lucide " +
		"and the ENABLE word list.\n\nMIT licence, no warranty.")
}

// ---------- the log ----------

// log: a line for the log, on stderr (run it from Terminal) and kept for Help > Show Log
func (a *App) log(text string) {
	fmt.Fprintln(os.Stderr, text)
	a.logMu.Lock()
	defer a.logMu.Unlock()
	a.logLines = append(a.logLines, time.Now().Format("15:04:05")+"  "+text)
	if n := len(a.logLines) - logMax; n > 0 {
		a.logLines = append([]string(nil), a.logLines[n:]...)
	}
}

// LogText: what's been logged since Mouse Party started (Help > Show Log); in memory only, gone at quit
func (a *App) LogText() string {
	a.logMu.Lock()
	defer a.logMu.Unlock()
	return strings.Join(a.logLines, "\n")
}

// ---------- the Dock and notifications ----------

// badge: the Dock icon says how far the downloads have got while any are going
func (a *App) badge() {
	var got, total int64
	for _, it := range a.cfg.Queue {
		if d := it.dl; d != nil && d.total > 0 {
			got, total = got+d.got, total+d.total
		}
	}
	label := ""
	if total > 0 {
		label = fmt.Sprintf("%d%%", got*100/total)
	}
	if label != a.badgeShown && a.ctx != nil {
		a.badgeShown = label
		nativeBadge(label)
	}
}

// notify: a notification, when it's wanted (Settings > General) and Mouse Party isn't the app in front
func (a *App) notify(title, body string) {
	if a.ctx == nil || !a.cfg.Notify || nativeActive() {
		return
	}
	ctx := a.ctx
	go func() { // asked for the first time it's wanted, not at start
		a.notifyOnce.Do(func() {
			if runtime.InitializeNotifications(ctx) == nil && runtime.IsNotificationAvailable(ctx) {
				ok, err := runtime.RequestNotificationAuthorization(ctx)
				a.notifyOK = ok && err == nil
			}
		})
		if a.notifyOK {
			runtime.SendNotification(ctx, runtime.NotificationOptions{
				ID: fmt.Sprintf("mp-%d", time.Now().UnixNano()), Title: title, Body: body})
		}
	}()
}
