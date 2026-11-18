package main

// The parts of a Mac app around the window: the menu bar (the app menu our own, so Settings…
// and Check for Updates… are where a Mac app has them; Edit's Undo the list's own; a Help
// menu), the About panel, the Dock icon's badge while something downloads, notifications
// while Mouse Party is in the background, and the log, kept in memory for Help > Show Log.

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	helpURL     = "https://github.com/ftrain/mouseparty#readme"
	releasesURL = "https://github.com/ftrain/mouseparty/releases"
	logMax      = 2000 // lines Help > Show Log keeps
)

const credits = "By Paul Ford\n\n" +
	"Made with FFmpeg, x264, Opus, libass, FreeType, HarfBuzz, FriBidi, MediaMTX, cloudflared, pandoc, " +
	"Python, Datasette, SQLite, Wails, wazero, pdfcpu, hls.js, pdf.js, Tiny Little Office, Lucide " +
	"and the ENABLE word list.\n\nMIT licence, no warranty."

// emit: an event for the window
func (a *App) emit(name string, data ...any) {
	if a.ctx != nil && !a.closing.Load() {
		runtime.EventsEmit(a.ctx, name, data...)
	}
}

// AboutInfo is what Help > About Mouse Party shows where the system has no About panel of its own.
type AboutInfo struct {
	Version string `json:"version"`
	Credits string `json:"credits"`
}

// About returns this build's version ("dev" for a build made here) and the credits.
func (a *App) About() AboutInfo { return AboutInfo{Version: version, Credits: credits} }

// ---------- the log ----------

var logOnStderr = sync.OnceValue(func() bool { return os.Getenv("MOUSEPARTY_LOG") == "stderr" || stderrForLog() })

// log: a line for the log, on stderr (run it from Terminal) and kept for Help > Show Log
func (a *App) log(text string) {
	if logOnStderr() {
		fmt.Fprintln(os.Stderr, text)
	}
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

// badge: how far the downloads have got while any are going
func (a *App) badge() {
	if a.closing.Load() {
		return
	}
	var got, total int64
	for _, it := range a.cfg.Queue {
		if d := it.dl; d != nil && d.total > 0 {
			got, total = got+d.got, total+d.total
		}
	}
	label, percent := "", -1
	if total > 0 {
		percent = int(got * 100 / total)
		label = fmt.Sprintf("%d%%", percent)
	}
	if label != a.badgeShown && a.ctx != nil {
		a.badgeShown = label
		a.showBadge(label, percent)
	}
}

var pageAway atomic.Bool

// Focused records whether the window has the keyboard focus, as its page sees it.
func (a *App) Focused(on bool) { pageAway.Store(!on) }

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
				notified(ctx)
			}
		})
		if a.notifyOK {
			runtime.SendNotification(ctx, runtime.NotificationOptions{
				ID: fmt.Sprintf("mp-%d", time.Now().UnixNano()), Title: title, Body: body})
		}
	}()
}
