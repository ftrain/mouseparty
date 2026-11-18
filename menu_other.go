//go:build !darwin

package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	lanNote      = "Local network only"
	thisComputer = "this computer"
)

func (a *App) menu() *menu.Menu {
	m := menu.NewMenu()
	cb := func(f func()) menu.Callback { return func(*menu.CallbackData) { f() } }

	file := m.AddSubmenu(label("&File"))
	if onWindows {
		file.AddText("&Settings…\tCtrl+,", nil, cb(func() { a.ask("prefs") }))
		file.AddSeparator()
		file.AddText("E&xit", nil, cb(func() { runtime.Quit(a.ctx) }))
	} else {
		file.AddText("Quit", keys.CmdOrCtrl("q"), cb(func() { runtime.Quit(a.ctx) }))
	}

	edit := m.AddSubmenu(label("&Edit"))
	for _, e := range [][3]string{{"&Undo", "Ctrl+Z", "undo"}, {"&Redo", "Ctrl+Y", "redo"}, {},
		{"Cu&t", "Ctrl+X", "cut"}, {"&Copy", "Ctrl+C", "copy"}, {"&Paste", "Ctrl+V", "paste"}, {"Select &All", "Ctrl+A", "selectAll"}} {
		if e[0] == "" {
			edit.AddSeparator()
			continue
		}
		action := e[2]
		edit.AddText(hinted(e[0], e[1]), nil, cb(func() { a.emit("edit", action) }))
	}
	if !onWindows {
		edit.AddSeparator()
		edit.AddText("Preferences", keys.CmdOrCtrl(","), cb(func() { a.ask("prefs") }))
	}

	party := m.AddSubmenu(label("&Party"))
	party.AddText(label("Add &Download Link…"), keys.CmdOrCtrl("l"), cb(func() { a.ask("link") }))
	party.AddText(label("C&lear Played Files"), keys.CmdOrCtrl("r"), cb(a.ClearPlayed))
	party.AddText(label("Clear Download &Cache…"), nil, cb(func() { a.ask("clear") }))
	party.AddText(label("&Erase All Data…"), nil, cb(func() { a.ask("erase") }))
	party.AddSeparator()
	party.AddText(label("E&ncryption…"), nil, cb(func() { a.ask("security") }))

	help := m.AddSubmenu(label("&Help"))
	help.AddText(label("Mouse Party &Help"), keys.Key("F1"), cb(func() { runtime.BrowserOpenURL(a.ctx, helpURL) }))
	if onWindows {
		help.AddText("&Keyboard Shortcuts\tCtrl+/", nil, cb(func() { a.ask("keys") }))
	} else {
		help.AddText("Keyboard Shortcuts", keys.CmdOrCtrl("?"), cb(func() { a.ask("keys") }))
	}
	help.AddText(label("&Welcome to Mouse Party"), nil, cb(func() { a.ask("welcome") }))
	help.AddSeparator()
	help.AddText(label("Show &Log"), keys.Combo("l", keys.CmdOrCtrlKey, keys.ShiftKey), cb(func() { a.ask("log") }))
	help.AddText(label("&Release Notes"), nil, cb(func() { runtime.BrowserOpenURL(a.ctx, releasesURL) }))
	help.AddText(label("Check for &Updates…"), nil, cb(a.checkFromMenu))
	help.AddSeparator()
	help.AddText(label("&About Mouse Party"), nil, cb(a.about))
	return m
}

func label(s string) string {
	if onWindows {
		return s
	}
	return strings.ReplaceAll(s, "&", "")
}

func hinted(s, hint string) string {
	if onWindows {
		return s + "\t" + hint
	}
	return label(s)
}

func (a *App) setMenu() {}

func (a *App) checkFromMenu() {
	a.do(func() {
		if !a.locked {
			a.checkUpdates(true)
		}
	})
	a.ask("updates")
}

func (a *App) about() { a.ask("about") }

var (
	titles    = make(chan string, 1)
	titleOnce sync.Once
)

func (a *App) showBadge(label string, _ int) {
	ctx := a.ctx
	titleOnce.Do(func() {
		go func() {
			for t := range titles {
				runtime.WindowSetTitle(ctx, t)
			}
		}()
	})
	title := "Mouse Party"
	if label != "" {
		title += " – " + label
	}
	select {
	case <-titles:
	default:
	}
	titles <- title
}

func (a *App) domReady(ctx context.Context) {
	a.readyOnce.Do(func() {
		quitWithSession(a, ctx)
		showWindow(ctx, lastFrame)
		if startsAtDomReady {
			a.begin()
		}
		dir, _ := os.Getwd()
		a.openArgs(dir, os.Args[1:])
	})
}

func notified(ctx context.Context) {
	runtime.OnNotificationResponse(ctx, func(runtime.NotificationResult) { raise(ctx) })
}

func raise(ctx context.Context) {
	if !onWindows || runtime.WindowIsMinimised(ctx) {
		runtime.WindowUnminimise(ctx)
	}
	runtime.WindowShow(ctx)
}

func missing(tool string) string {
	switch tool {
	case "mediamtx":
		return "MediaMTX is missing (" + toolHint(tool) + "); it is what sends the video to viewers."
	case "cloudflared":
		return "cloudflared is missing (" + toolHint(tool) + "); the link will be a direct one."
	}
	return "Missing: " + tool + " (" + toolHint(tool) + ")."
}

type frame struct {
	Width     int  `json:"width"`
	Height    int  `json:"height"`
	Left      int  `json:"left,omitempty"`
	Top       int  `json:"top,omitempty"`
	Placed    bool `json:"placed,omitempty"`
	Maximized bool `json:"maximized,omitempty"`
}

var lastFrame frame

func framePath() string { return filepath.Join(dataDir(), "window.json") }

func applyFrame(o *options.App) {
	if b, err := os.ReadFile(framePath()); err == nil && json.Unmarshal(b, &lastFrame) == nil {
		if lastFrame.Width < o.MinWidth || lastFrame.Height < o.MinHeight || lastFrame.Width > 20000 || lastFrame.Height > 20000 {
			lastFrame = frame{}
		}
	} else {
		lastFrame = frame{}
	}
	if lastFrame.Width == 0 {
		lastFrame.Width, lastFrame.Height = o.Width, o.Height
		return
	}
	if !lastFrame.Placed {
		o.Width, o.Height = lastFrame.Width, lastFrame.Height
		if lastFrame.Maximized {
			o.WindowStartState = options.Maximised
		}
	}
}

func (a *App) saveFrame(ctx context.Context) {
	f, ok := placement()
	if !ok {
		if ctx == nil {
			return
		}
		f = lastFrame
		f.Placed, f.Maximized = false, runtime.WindowIsMaximised(ctx)
		if !f.Maximized {
			f.Width, f.Height = runtime.WindowGetSize(ctx)
		}
	}
	if st, err := os.Stat(dataDir()); err != nil || !st.IsDir() || f.Width <= 0 || f.Height <= 0 {
		return
	}
	if b, err := json.Marshal(f); err == nil {
		os.WriteFile(framePath(), b, 0o600)
	}
}
