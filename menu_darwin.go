package main

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	startsAtDomReady  = false
	clearsLinkAtClose = false
	quitTitle         = "Quit"
	lanNote           = "Wi-Fi only"
	thisComputer      = "this Mac"
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
		app.AddText("Check for Updates…", nil, cb(func() { a.CheckForUpdates(); a.ask("updates") })).Disabled = a.locked
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

// about: the Mac's own About panel (the icon, the name, the version from Info.plist): who made it, and
// the open source it's made with (licenses/README.md has every one, and its licence)
func (a *App) about() { nativeAbout(credits) }

func (a *App) showBadge(label string, percent int) { nativeBadge(label, percent) }

func (a *App) domReady(context.Context) { nativeKeepFrame() }

func (a *App) saveFrame(context.Context) {}

func notified(context.Context) {}

func stderrForLog() bool { return true }

func raise(ctx context.Context) {
	runtime.WindowUnminimise(ctx)
	runtime.Show(ctx)
}

func missing(tool string) string {
	switch tool {
	case "mediamtx":
		return "MediaMTX is missing (" + toolHint(tool) + "); it is what sends the video to viewers."
	case "cloudflared":
		return "cloudflared is missing (" + toolHint(tool) + "); the link will be a direct one."
	}
	return "Missing: " + tool + ". Install with: " + toolHint(tool)
}
