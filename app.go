package main

// The app: two big buttons (Play/Stop, and Copy link) over a list of movies,
// music and PDFs you drag in and drag into order. It plays them one after another
// with ffmpeg into this Mac's own MediaMTX; Host serves friends the page.
//
// Every change to the app's state happens on one goroutine (run), one job at a
// time, like a UI's main loop: clicks from the window, ffmpeg's positions and its
// exit, timers. After each job the window is sent what it should now show.

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const startGap = 3.0 // seconds ffmpeg takes to start a movie or card, for the guide's arithmetic

// What the window shows; it draws exactly this.
type View struct {
	Play      string `json:"play"`      // "play" or "stop"
	PlayOn    bool   `json:"playOn"`    // in colour, and can be pressed
	Link      string `json:"link"`      // "copy" or "spinner"
	LinkOn    bool   `json:"linkOn"`    // in colour
	LinkPress bool   `json:"linkPress"` // can be pressed
	LinkNote  string `json:"linkNote"`  // under the icon: "Making link", "Copied", "Wi-Fi only"...
	Rows      []Row  `json:"rows"`
	Selected  int    `json:"selected"` // -1: none
	Slider    Slider `json:"slider"`
	Locked    bool   `json:"locked"` // the party is sealed: the window asks for its passcode, and shows nothing else
	Sealed    bool   `json:"sealed"` // the party is kept encrypted
}

type Row struct {
	Title  string `json:"title"`
	Length string `json:"length"`
	Now    bool   `json:"now"`    // playing
	Played bool   `json:"played"` // above the one playing, or next to play
	Off    bool   `json:"off"`    // can't play: its file is gone (a drive unplugged) or unreadable
}

// Slider: the playhead (seconds into the movie), or a PDF's pages
type Slider struct {
	On    bool    `json:"on"`
	Min   float64 `json:"min"`
	Max   float64 `json:"max"`
	Value float64 `json:"value"`
	Label string  `json:"label"`
	Pages bool    `json:"pages"`
}

type moviePos struct {
	seconds float64
	at      time.Time
}

type cueKey struct {
	path, track string
	offset      float64
}

type App struct {
	ctx      context.Context
	jobs     chan func()
	lastView []byte

	cfg          *Config
	party        *party        // what's kept (store.go); nil keeps nothing
	locked       bool          // the party is sealed and its passcode not yet typed (party.go)
	unlockWait   time.Duration // before the next try, after a wrong passcode
	player       *Player
	current      *Item       // the item now streaming
	playing      bool        // Play pressed and not stopped: the big button says Stop
	playedFirst  bool        // the skip setting applies to the first file started
	stopRequest  bool        // Stop: keep the file where it is
	jumpTo       int         // row: double-clicked, or removed the one streaming; -1 none
	phase        string      // "countdown" (the up-next card), "movie" or "doc" (a PDF) while streaming
	docDone      bool        // turned past a PDF's last page: its card stopping is it finishing
	afterAudio   bool        // the last thing to finish was a song: the next song needs no countdown
	pendingSkip  float64     // minutes into the movie to start once the countdown ends
	countdownEnd time.Time   //
	host         *Host       // while serving viewers from this Mac
	hostStarting bool        //
	hostFailed   string      // why the last try at hosting didn't work, for the link button
	tunnelRetry  bool        // trying again for a Cloudflare link (the link button pressed)
	seekTo       *float64    // movie seconds: the slider was let go there; restart the movie at it
	selected     int         // -1: none
	restoreSel   int         // a row to select again after the next redraw; -1 none
	copiedUntil  time.Time   // the link button says "Copied" until then
	moviePos     *moviePos   // from ffmpeg's last position
	scheduleSent string      // what the viewers' guide was last told
	subToken     string      // names the movie now playing to viewers' subtitles
	language     string      // "en": the audio played, the subtitles offered first
	standby      []byte      // the card MediaMTX loops between movies
	hostSetup    func(*Host) // tests: free ports, no router, no tunnel

	cueMu    sync.Mutex
	cueCache map[cueKey][]Cue

	openMu   sync.Mutex // files dropped on the Dock icon, gathered (openFile)
	opening  []string
	openSoon *time.Timer
}

func NewApp(standby []byte) *App {
	a := &App{jobs: make(chan func(), 4096), jumpTo: -1, selected: -1, restoreSel: -1,
		language: hostLanguage(), standby: standby, cueCache: map[cueKey][]Cue{}}
	a.party, a.locked = openTheParty(a.log)
	a.cfg = loadConfig(a.party)
	a.player = &Player{Log: a.log,
		OnPosition: func(s float64) { a.do(func() { a.position(s) }) },
		OnExit:     func(code int) { a.do(func() { a.finished(code) }) }}
	return a
}

func (a *App) log(text string) { fmt.Fprintln(os.Stderr, text) } // run it from Terminal to read this

// ---------- the one goroutine ----------

func (a *App) run() {
	for job := range a.jobs {
		job()
		a.publish()
	}
}

func (a *App) do(job func()) { a.jobs <- job }

func (a *App) after(d time.Duration, job func()) { time.AfterFunc(d, func() { a.do(job) }) }

// wait runs job on the app's goroutine and returns once it has
func (a *App) wait(job func()) {
	done := make(chan struct{})
	a.do(func() { job(); close(done) })
	<-done
}

func (a *App) every(d time.Duration, job func()) {
	go func() {
		for range time.Tick(d) {
			a.do(job)
		}
	}()
}

func (a *App) publish() {
	v := a.view()
	b, _ := json.Marshal(v)
	if string(b) != string(a.lastView) && a.ctx != nil {
		a.lastView = b
		runtime.EventsEmit(a.ctx, "view", v)
	}
}

// startup is Wails's OnStartup
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	go a.run()
	a.every(500*time.Millisecond, func() {})            // the playhead moves
	a.every(2*time.Second, func() { a.sendSchedule() }) // and the guide follows
	go a.watchFiles()
	a.do(func() {
		a.checkTools()
		if !a.locked {
			a.started()
		}
	})
}

// started: the list is known (at startup, or once the party is unlocked)
func (a *App) started() {
	a.scanSubtitles()
	if len(a.cfg.Queue) > 0 { // movies waiting from last time: start making their link
		a.hostStart()
	}
}

// ---------- what the window calls ----------

func (a *App) GetView() View {
	var v View
	a.wait(func() { v = a.view() })
	return v
}

func (a *App) PlayClicked()                 { a.do(a.playClicked) }
func (a *App) LinkClicked()                 { a.do(a.linkClicked) }
func (a *App) Select(i int)                 { a.do(func() { a.selectRow(i) }) }
func (a *App) Move(from, to int)            { a.do(func() { a.move(from, to) }) }
func (a *App) PlayRow(i int)                { a.do(func() { a.playRow(i) }) }
func (a *App) Remove()                      { a.do(a.remove) }
func (a *App) Seek(seconds float64)         { a.do(func() { a.seek(seconds) }) }
func (a *App) ShowPage(page int)            { a.do(func() { a.showPage(page) }) }
func (a *App) TurnPage(step int)            { a.do(func() { a.turnPage(step) }) }
func (a *App) AddPaths(p []string, row int) { go a.addPaths(p, row) }

// openFile: a file or folder dropped on the Dock icon (main.go's OnFileOpen), one call each; those that come
// together are added together, in the order they came, as a drop on the list is
func (a *App) openFile(path string) {
	a.openMu.Lock()
	defer a.openMu.Unlock()
	a.opening = append(a.opening, path)
	if a.openSoon == nil {
		a.openSoon = time.AfterFunc(300*time.Millisecond, func() {
			a.openMu.Lock()
			paths := a.opening
			a.opening, a.openSoon = nil, nil
			a.openMu.Unlock()
			a.addPaths(paths, -1)
		})
	}
}

// ---------- what the app is doing ----------
// One state, worked out from the facts, decides what can be pressed:
//
//	empty      no movies               Play off, link off, slider off
//	linking    making the link         Play off (nothing plays before the link exists)
//	nolink     hosting failed          Play off, the link button tries again
//	ready      link up, not playing    Play, double-click a row to play it
//	countdown  the up-next card        Stop, double-click to switch
//	movie      a movie streaming       Stop, double-click to switch, slider seeks
//	doc        a PDF up                Stop, double-click to switch, slider and arrow keys turn pages
//	between    a moment between two movies, or a seek or switch under way: Stop
//	stopping   Stop pressed, ffmpeg not yet gone: nothing until it has
//
// Adding movies is always allowed, and so is removing them; removing the last one stops.
func (a *App) state() string {
	streaming := a.phase != "" // ffmpeg started and its exit not yet handled
	switch {
	case a.playing:
		if streaming && a.player.Running() && a.seekTo == nil && a.jumpTo < 0 {
			return a.phase
		}
		return "between"
	case streaming:
		return "stopping"
	case len(a.cfg.Queue) == 0:
		return "empty"
	case a.hostStarting:
		return "linking"
	case a.host == nil || !a.host.Running():
		return "nolink"
	}
	return "ready"
}

func (a *App) view() View {
	state := a.state()
	v := View{Play: "play", PlayOn: state == "ready", Link: "copy", Selected: a.selected, Rows: []Row{}}
	if a.locked {
		return View{Play: "play", Link: "copy", Selected: -1, Rows: []Row{}, Locked: true, Sealed: true}
	}
	v.Sealed = a.party != nil && a.party.sealed
	if a.playing {
		v.Play, v.PlayOn = "stop", true
	}
	link := a.link()
	switch {
	case a.hostStarting || a.tunnelRetry:
		v.Link, v.LinkOn, v.LinkNote = "spinner", true, "Making link"
	case link != "":
		v.LinkOn, v.LinkPress = true, true
		if time.Now().Before(a.copiedUntil) {
			v.LinkNote = "Copied"
		} else if link == a.host.URLs()["lan"] {
			v.LinkNote = "Wi-Fi only"
		}
	case (a.hostFailed != "" || (a.host != nil && a.host.Running())) && len(a.cfg.Queue) > 0:
		v.LinkPress, v.LinkNote = true, "No link – try again" // hosting, but Cloudflare said no
		if strings.Contains(a.hostFailed, "address already in use") {
			v.LinkNote = "Port in use – try again" // something else has the site's or MediaMTX's port
		}
	default:
		v.LinkPress = len(a.cfg.Queue) > 0
	}
	for i, it := range a.cfg.Queue {
		title := displayTitle(it.Path)
		if it.Note != "" {
			title += "  (" + it.Note + ")"
		}
		length := ""
		if it.kind() == "pdf" {
			length = fmt.Sprintf("%d pages", it.Pages)
		} else if it.kind() == "db" {
			length = formatBytes(it.Size)
		} else if it.kind() == "text" {
			length = strings.ToUpper(strings.TrimPrefix(ext(it.Path), "."))
		} else if it.Duration > 0 {
			length = formatTime(it.Duration)
		}
		v.Rows = append(v.Rows, Row{Title: title, Length: length, Now: a.playing && i == a.cfg.Position,
			Played: i < a.cfg.Position, Off: off(it)})
	}
	v.Slider = a.slider(state)
	return v
}

func (a *App) slider(state string) Slider {
	if state == "doc" && a.current.kind() != "pdf" { // a database or another document: no slider; viewers look through it
		return Slider{Max: 1}
	}
	if state == "doc" { // a PDF: the slider is its pages
		d := a.current
		return Slider{On: d.Pages > 1, Min: 1, Max: float64(max(2, d.Pages)), Value: float64(d.Page),
			Label: fmt.Sprintf("%d / %d", d.Page, d.Pages), Pages: true}
	}
	s := Slider{Max: 1}
	if pos, duration, ok := a.playhead(); ok && duration > 0 {
		s.Max, s.Value, s.Label = duration, pos, formatTime(pos)
		s.On = state == "movie"
	}
	return s
}

// playhead: seconds into the movie now streaming, and its length
func (a *App) playhead() (float64, float64, bool) {
	if a.phase != "movie" || a.current == nil {
		return 0, 0, false
	}
	duration := a.current.Duration
	if a.seekTo != nil {
		return *a.seekTo, duration, true
	}
	if a.moviePos == nil {
		return 0, duration, true
	}
	pos := a.moviePos.seconds + time.Since(a.moviePos.at).Seconds()
	top := duration
	if top == 0 {
		top = a.moviePos.seconds
	}
	return max(0, min(top, pos)), duration, true
}

func (a *App) checkTools() {
	for _, t := range []string{"ffmpeg"} {
		if findTool(t) == "" {
			a.log("Missing: " + t + ". Install with: brew install ffmpeg")
		}
	}
}

// ---------- the list ----------
// The list is a playlist: movies stay in it, and cfg.Position is the row now
// playing (or next to play). Finishing a movie moves it down a row.

func (a *App) save() { saveConfig(a.party, a.cfg) }

func (a *App) selectRow(i int) {
	if i >= -1 && i < len(a.cfg.Queue) {
		a.selected = i
	}
}

// editQueue applies change, keeping the position on the same movie. moving is the
// movie being dragged; if that is the next-up movie and nothing is streaming, the
// position stays on its row instead.
func (a *App) editQueue(change func([]*Item) []*Item, moving *Item) {
	q, pos := a.cfg.Queue, a.cfg.Position
	var anchor *Item
	if pos < len(q) {
		anchor = q[pos]
	}
	if anchor != nil && anchor == moving && !a.player.Running() {
		anchor = nil
	}
	a.cfg.Queue = change(q)
	a.cfg.Position = min(pos, len(a.cfg.Queue))
	for i, it := range a.cfg.Queue {
		if it == anchor {
			a.cfg.Position = i
		}
	}
	if a.restoreSel >= 0 && a.restoreSel < len(a.cfg.Queue) {
		a.selected = a.restoreSel
	}
	if a.selected >= len(a.cfg.Queue) {
		a.selected = -1
	}
	a.save()
}

func (a *App) move(i, j int) {
	q := a.cfg.Queue
	if i < 0 || j < 0 || i >= len(q) || j >= len(q) || i == j {
		return
	}
	a.editQueue(func(q []*Item) []*Item {
		it := q[i]
		q = append(q[:i], q[i+1:]...)
		return append(q[:j], append([]*Item{it}, q[j:]...)...)
	}, q[i])
	a.selected = j
}

// addPaths: files or folders dropped from Finder (a folder adds what's in it, in
// name order), looked at off the app's goroutine. A subtitle file dropped onto a
// movie (row, or the selected one) becomes its subtitles.
func (a *App) addPaths(paths []string, row int) {
	locked := false
	a.wait(func() { locked = a.locked })
	if locked { // the list isn't known until the party is open
		return
	}
	var files, subs []string
	// a folder's files that can be shown, in name order
	walk := func(dir string) []string {
		var found []string
		filepath.WalkDir(dir, func(f string, d os.DirEntry, err error) error {
			if err == nil && !d.IsDir() && shareable(f) && d.Name()[0] != '.' {
				found = append(found, f)
			}
			return nil
		})
		sort.Slice(found, func(i, j int) bool { return strings.ToLower(found[i]) < strings.ToLower(found[j]) })
		return found
	}
	for _, p := range paths {
		st, err := os.Stat(p)
		switch {
		case err == nil && st.IsDir():
			files = append(files, walk(p)...)
		case err == nil && ext(p) == ".zip": // unpacked beside it (zip.go), then as a folder
			dir, err := unzip(p)
			if err != nil {
				a.log("Couldn't unpack " + filepath.Base(p) + ": " + err.Error())
			}
			if dir != "" {
				a.log("Unpacked " + filepath.Base(p) + " into " + dir)
				files = append(files, walk(dir)...)
			}
		case shareable(p):
			files = append(files, p)
		case subExts[ext(p)]:
			subs = append(subs, p)
		case err == nil && playable(p): // dropped by itself, in a format with no usual name: ffmpeg says it plays
			files = append(files, p)
		default:
			a.log("Not a video, sound, document, database or zip file, skipped: " + filepath.Base(p))
		}
	}
	var items []*Item
	for _, p := range files {
		if kindOf(p) == "db" {
			size, note := sqliteSize(p)
			if note == "not a SQLite database" { // Thumbs.db and the like
				a.log("Not a SQLite database, skipped: " + filepath.Base(p))
				continue
			}
			items = append(items, &Item{Path: p, Kind: "db", Size: size, Note: note})
			a.log(fmt.Sprintf("Queued %s (%s)", filepath.Base(p), formatBytes(size)))
			continue
		}
		if kindOf(p) == "pdf" {
			it := &Item{Path: p, Kind: "pdf", Pages: pdfPages(p), Page: 1}
			if it.Pages == 0 {
				it.Note = "can't open it"
			}
			items = append(items, it)
			a.log(fmt.Sprintf("Queued %s (%d pages)", filepath.Base(p), it.Pages))
			continue
		}
		if kindOf(p) == "text" { // read by pandoc when it's up (session.go)
			items = append(items, &Item{Path: p, Kind: "text"})
			a.log("Queued " + filepath.Base(p))
			continue
		}
		info := probe(p)
		it := &Item{Path: p, Kind: "video", Duration: info.Duration}
		if info.Audio != "" && info.Video == "" {
			it.Kind = "audio"
		}
		if info.Error != "" {
			it.Note = info.Error
			a.log(filepath.Base(p) + ": " + info.Error)
		}
		applyFound(it, findTracks(it))
		items = append(items, it)
		a.log(fmt.Sprintf("Queued %s (%s)", filepath.Base(p), formatTime(it.Duration)))
	}
	a.do(func() {
		for _, s := range subs {
			i := row
			if i < 0 {
				i = a.selected
			}
			a.attachSubtitles(i, s)
		}
		if len(items) == 0 {
			return
		}
		a.cfg.Queue = append(a.cfg.Queue, items...)
		a.save()
		if a.host == nil || !a.host.Running() {
			a.hostStart()
		}
	})
}

// playRow: a double-click. Not playing: play it. Playing: stop what's on, at any
// moment (a seek or a switch under way, the gap between two), and play it next.
func (a *App) playRow(i int) {
	if i < 0 || i >= len(a.cfg.Queue) || off(a.cfg.Queue[i]) {
		return
	}
	switch {
	case a.state() == "ready":
		a.playing = true
		a.play(i)
	case !a.playing: // stopping, or no link yet
	case a.phase != "": // streaming, or a seek or switch on its way: finished plays i
		if i == a.cfg.Position && a.jumpTo < 0 && a.seekTo == nil {
			return // the one on now
		}
		a.log("Switching to " + filepath.Base(a.cfg.Queue[i].Path))
		a.jumpTo, a.seekTo = i, nil
		a.player.Stop()
	default: // between two: the next one up is this one
		a.cfg.Position = i
		a.save()
	}
}

func (a *App) remove() {
	i := a.selected
	if i < 0 || i >= len(a.cfg.Queue) {
		return
	}
	streaming := a.player.Running() && i == a.cfg.Position
	a.editQueue(func(q []*Item) []*Item { return append(q[:i], q[i+1:]...) }, nil) // position now points at the one after
	if len(a.cfg.Queue) == 0 {                                                     // nothing left to play: whatever was going on stops
		a.seekTo, a.jumpTo = nil, -1
		a.stop()
		return
	}
	a.selected = min(i, len(a.cfg.Queue)-1) // the one that moved up, to keep removing
	if streaming {                          // go straight on to the next one
		a.restoreSel = a.selected // moving on redraws the list; keep that selection
		if a.cfg.Position < len(a.cfg.Queue) {
			a.jumpTo = a.cfg.Position
		} else {
			a.stopRequest, a.playing = true, false
		}
		a.player.Stop()
	}
}

// ---------- playback ----------

func (a *App) playClicked() {
	if a.playing {
		a.stop()
	} else if a.state() == "ready" {
		a.playing = true
		a.play(a.selected)
	}
}

// play streams the movie at index, or at the position (-1; from the top once the list is done)
func (a *App) play(index int) {
	q := a.cfg.Queue
	if a.player.Running() || len(q) == 0 || !a.playing {
		return
	}
	if a.host == nil || !a.host.Running() { // Play is off until the link is ready; hosting went away
		a.playing = false
		return
	}
	pos := a.cfg.Position
	if index >= 0 && index < len(q) && !off(q[index]) {
		pos = index
	} else if pos >= len(q) {
		pos = 0
	}
	for pos < len(q) && off(q[pos]) { // greyed out: on to the next that can play
		pos++
	}
	if pos >= len(q) {
		a.log("Nothing further down the list can play.")
		a.cfg.Position, a.playing = len(q), false
		a.save()
		return
	}
	a.cfg.Position = pos
	a.current = q[pos]
	if a.current.Note == "didn't play" {
		a.current.Note = ""
	}
	a.save()
	a.offerSubtitles(a.current)
	skip := 0.0
	if !a.playedFirst {
		skip = float64(a.cfg.Skip)
	}
	a.playedFirst = true
	countdown := max(0, int(a.cfg.Countdown))
	if a.afterAudio && a.current.kind() == "audio" {
		countdown = 0 // an album plays straight through
	}
	a.afterAudio = false
	if countdown > 0 {
		a.pendingSkip = skip
		a.startCountdown(countdown)
	} else {
		a.startCurrent(skip)
	}
	if a.selected != a.cfg.Position {
		a.selected = -1
	}
	a.restoreSel = -1
}

func (a *App) opts() StreamOpts {
	return StreamOpts{URL: a.host.RTSPURL(), Bitrate: a.cfg.Bitrate, Preset: a.cfg.Preset}
}

// startCountdown: the "up next" card for a.current; finished starts the movie after it
func (a *App) startCountdown(seconds int) {
	a.stopRequest, a.jumpTo = false, -1
	a.phase = "countdown"
	a.countdownEnd = time.Now().Add(time.Duration(seconds) * time.Second)
	args, temps := countdownCommand(seconds, displayTitle(a.current.Path), a.opts())
	if err := a.player.Start(args, temps, 0, ""); err != nil {
		a.log("Could not start ffmpeg: " + err.Error())
		a.current, a.phase, a.playing = nil, "", false
	}
}

// startCurrent streams a.current, starting skip minutes in (a PDF or a database: its card, and the file to viewers)
func (a *App) startCurrent(skip float64) {
	a.moviePos = &moviePos{skip * 60, time.Now().Add(startGap * time.Second)} // until ffmpeg reports in
	a.stopRequest, a.jumpTo, a.docDone = false, -1, false
	it := a.current
	var err error
	if it.isDoc() {
		a.phase = "doc"
		a.host.SetDocument(document{Token: strconv.FormatInt(time.Now().UnixMilli(), 10), Path: it.Path, Title: displayTitle(it.Path),
			Kind: it.kind(), Pages: it.Pages, Page: max(1, it.Page), At: it.At})
		args, temps := documentCommand(it.kind(), displayTitle(it.Path), a.opts())
		err = a.player.Start(args, temps, 0, "")
	} else {
		a.phase = "movie"
		args, temps := movieCommand(it.Path, skip*60, it.Duration, a.audioTrack(it), a.burn(it), a.opts())
		err = a.player.Start(args, temps, skip*60, a.host.RTSPURL())
	}
	if err != nil {
		a.log("Could not start ffmpeg: " + err.Error())
		a.current, a.phase, a.playing = nil, "", false
	}
}

func (a *App) stop() {
	a.playing = false
	if a.player.Running() {
		a.log("Stopping " + filepath.Base(a.current.Path))
		a.stopRequest = true
		a.player.Stop()
	}
}

func (a *App) seek(seconds float64) {
	if a.state() != "movie" {
		return
	}
	a.log("Moving to " + formatTime(seconds))
	a.seekTo = &seconds
	a.player.Stop() // finished starts the movie again from there
}

func (a *App) position(seconds float64) {
	a.moviePos = &moviePos{seconds, time.Now()} // for the guide: when this movie started
	if a.phase == "movie" && a.subToken != "" && a.host != nil && a.host.Running() {
		a.host.SetPosition(a.subToken, seconds)
	}
}

func (a *App) finished(code int) {
	if a.phase == "countdown" && a.current != nil && !a.stopRequest && a.jumpTo < 0 {
		// Countdown over: on to the movie. The card is only decoration, so a failed
		// one doesn't hold the movie up.
		if code != 0 {
			a.log(fmt.Sprintf("The countdown exited with code %d; starting the movie anyway.", code))
		}
		a.startCurrent(a.pendingSkip)
		return
	}
	if a.seekTo != nil && a.current != nil && a.playing && !a.stopRequest {
		seconds := *a.seekTo // the slider: same movie, from there
		a.seekTo = nil
		a.startCurrent(seconds / 60)
		return
	}
	a.seekTo = nil
	a.phase = ""
	it := a.current
	a.current = nil
	name := "?"
	if it != nil {
		name = filepath.Base(it.Path)
	}
	a.subToken = ""
	if a.host != nil && a.host.Running() {
		a.host.ClearSubtitles()
		a.host.SetShowing("", "")
		a.host.ClearDocument()
	}
	if a.docDone { // turned past a PDF's last page: it stopped because it's finished
		a.docDone, code = false, 0
		if it != nil {
			it.Page = 1 // read through: from the top next time
		}
	}
	if a.jumpTo >= 0 { // double-clicked another row, or removed this one
		jump := a.jumpTo
		a.jumpTo = -1
		a.play(jump)
		return
	}
	a.restoreSel = -1
	if a.stopRequest {
		a.log("Stopped " + name + ".")
		a.playedFirst = false
		return
	}
	if code != 0 {
		a.log(fmt.Sprintf("ffmpeg exited with code %d on %s; not continuing.", code, name))
		if it != nil {
			it.Note = "didn't play"
		}
		a.playing = false
		a.save()
		return
	}
	a.log("Finished " + name + ".")
	a.afterAudio = it != nil && it.kind() == "audio"
	a.cfg.Position++
	if a.cfg.Position >= len(a.cfg.Queue) {
		a.log("End of the list.")
		a.playing = false
	}
	a.save()
	if a.playing {
		a.after(500*time.Millisecond, func() { a.play(-1) }) // the server's stand-by card covers the gap
	}
}

// ---------- a PDF, read together ----------

// turnPage: the arrow keys: the next or last page; past the last, on to what follows
func (a *App) turnPage(step int) {
	if a.state() != "doc" {
		return
	}
	d := a.current
	if d.kind() != "pdf" && step < 0 {
		return
	}
	if d.kind() != "pdf" || d.Page+step > d.Pages { // past a PDF's last page, or on from a database or another document
		a.log("Finished " + filepath.Base(d.Path) + ".")
		a.docDone = true
		a.player.Stop()
		return
	}
	a.showPage(d.Page + step)
}

func (a *App) showPage(page int) {
	if a.state() != "doc" || a.current.kind() != "pdf" {
		return
	}
	d := a.current
	d.Page = max(1, min(d.Pages, page))
	a.host.SetPage(d.Page)
	a.save() // a PDF opens again where it was left
}

// docAt: viewers went to another page of the database up; it opens there next time
func (a *App) docAt(at string) {
	if a.state() == "doc" && a.current.kind() == "db" && a.current.At != at {
		a.current.At = at
		a.save()
	}
}

// ---------- subtitles ----------
// Each movie has Subtitles (what was found: tracks in the file and files beside
// it) and Subs, what to do with them. Text subtitles are offered to viewers;
// "burn" and the offset are only in the settings file.

func subsSettings(it *Item) *SubsSettings {
	if it.Subs == nil {
		it.Subs = &SubsSettings{Mode: "off", Files: []string{}}
	}
	return it.Subs
}

// findTracks: what ffmpeg and the folder have; safe off the app's goroutine (it changes nothing)
func findTracks(it *Item) []Track {
	found := findSubtitles(it.Path)
	keys := map[string]bool{}
	for _, t := range found {
		keys[t.Key] = true
	}
	if it.Subs != nil {
		for _, f := range it.Subs.Files {
			if _, err := os.Stat(f); err == nil && !keys["file:"+f] {
				found = append(found, subtitleFile(f, it.Path))
			}
		}
	}
	return found
}

func applyFound(it *Item, found []Track) {
	s := subsSettings(it)
	first := it.Subtitles == nil
	it.Subtitles = &found
	if first && s.Mode == "off" {
		for _, t := range found {
			if t.Text {
				s.Mode = "viewers" // text subtitles: offer them, like YouTube's CC
				break
			}
		}
	}
}

func (a *App) tracks(it *Item) []Track {
	if it.isDoc() {
		return nil
	}
	if it.Subtitles == nil {
		applyFound(it, findTracks(it))
	}
	return *it.Subtitles
}

// scanSubtitles: movies listed before subtitles were looked for get looked at, in the background
func (a *App) scanSubtitles() {
	var todo []*Item
	for _, it := range a.cfg.Queue {
		if it.Subtitles == nil && !it.isDoc() {
			todo = append(todo, it)
		}
	}
	for _, it := range todo {
		go func() {
			found := findTracks(it)
			a.do(func() { applyFound(it, found); a.save() })
		}()
	}
}

func (a *App) attachSubtitles(i int, path string) {
	if i < 0 || i >= len(a.cfg.Queue) || a.cfg.Queue[i].isDoc() {
		a.log("Drop " + filepath.Base(path) + " onto a movie (or select one first) to give it those subtitles.")
		return
	}
	it := a.cfg.Queue[i]
	s := subsSettings(it)
	known := false
	for _, f := range s.Files {
		known = known || f == path
	}
	if !known {
		s.Files = append(s.Files, path)
	}
	if s.Mode == "off" {
		s.Mode = "viewers"
	}
	applyFound(it, findTracks(it))
	a.save()
	a.log("Subtitles " + filepath.Base(path) + " added to " + filepath.Base(it.Path) + ".")
}

// burn: which subtitles to draw into the video, if the settings say to
func (a *App) burn(it *Item) Burn {
	b := Burn{TextTrack: -1, ImageTrack: -1}
	s := subsSettings(it)
	if s.Mode != "burn" || s.Burn == "" {
		return b
	}
	for _, t := range a.tracks(it) {
		if t.Key != s.Burn {
			continue
		}
		b.Offset = s.Offset
		switch {
		case t.Kind == "file":
			b.SRT = t.Path
		case t.Text:
			b.TextTrack = t.Index
		default:
			b.ImageTrack = t.Index
		}
		return b
	}
	a.log("The subtitles chosen for burning in are gone; playing without them.")
	return b
}

// audio: the sound track to play: the one in the Mac's language, else the file's default
func (a *App) audio(it *Item) *AudioTrack {
	if it.Audio == nil {
		tracks := audioTracks(it.Path)
		it.Audio = &tracks
	}
	return pickAudio(*it.Audio, a.language)
}

func (a *App) audioTrack(it *Item) int {
	t := a.audio(it)
	if t == nil || len(*it.Audio) < 2 {
		return 0
	}
	name := languageName(t.Lang)
	if name == "" {
		name = "default"
	}
	a.log("Playing the " + name + " audio.")
	return t.Index
}

// offerSubtitles: for "viewers", turn the text tracks into lines (in the background) and hand them to the host
func (a *App) offerSubtitles(it *Item) {
	a.subToken = strconv.FormatInt(time.Now().UnixMilli(), 10)
	if a.host != nil && a.host.Running() {
		a.host.ClearSubtitles()
		if it.kind() == "video" { // frames from it, for documents and the graffiti reel
			a.host.SetShowing(it.Path, displayTitle(it.Path))
		} else {
			a.host.SetShowing("", "")
		}
	}
	if it.isDoc() || subsSettings(it).Mode != "viewers" {
		return
	}
	offset := subsSettings(it).Offset
	// the Mac's language first in viewers' CC menu, and on to start with when the movie speaks another
	var tracks []Track
	for _, t := range a.tracks(it) {
		if t.Text {
			tracks = append(tracks, t)
		}
	}
	sort.SliceStable(tracks, func(i, j int) bool {
		return sameLanguage(tracks[i].Lang, a.language) && !sameLanguage(tracks[j].Lang, a.language)
	})
	audio := ""
	if t := a.audio(it); t != nil {
		audio = t.Lang
	}
	foreign := audio != "" && audio != "und" && !sameLanguage(audio, a.language)
	startOn := ""
	for _, t := range tracks {
		if foreign && sameLanguage(t.Lang, a.language) && !strings.Contains(t.Label, "(forced)") {
			startOn = t.Key
			break
		}
	}
	token, path := a.subToken, it.Path
	go func() {
		var out []SubTrack
		for n, t := range tracks {
			key := cueKey{path, t.Key, offset}
			a.cueMu.Lock()
			c, ok := a.cueCache[key]
			a.cueMu.Unlock()
			if !ok {
				c = cues(t, path, offset)
				a.cueMu.Lock()
				a.cueCache[key] = c
				a.cueMu.Unlock()
			}
			if len(c) > 0 {
				out = append(out, SubTrack{ID: strconv.Itoa(n), Label: t.Label, Lang: t.Lang, Cues: c, Default: t.Key == startOn})
			}
		}
		a.do(func() {
			if token == a.subToken && a.host != nil && a.host.Running() {
				a.host.SetSubtitles(token, out)
			}
		})
	}()
}

// ---------- hosting from this Mac ----------

// link: the one to hand out. With cloudflared, only Cloudflare's https one, once
// it's up: never a plain http link in its place. Without it, the direct one, else
// the LAN. Host.Start returns only after the tunnel is up (or has failed), so
// there is no moment when a half-ready Cloudflare link could be copied.
func (a *App) link() string {
	if a.host == nil || !a.host.Running() || a.hostStarting || a.tunnelRetry {
		return ""
	}
	u := a.host.URLs()
	if a.host.Cloudflared != "" {
		return u["cloudflare"]
	}
	for _, k := range []string{"internet", "lan"} {
		if u[k] != "" {
			return u[k]
		}
	}
	return ""
}

func (a *App) linkClicked() {
	if link := a.link(); link != "" {
		if a.ctx != nil {
			runtime.ClipboardSetText(a.ctx, link)
		}
		a.copiedUntil = time.Now().Add(1500 * time.Millisecond)
		a.after(1600*time.Millisecond, func() {})
	} else if a.state() == "nolink" {
		a.hostStart()
	} else if h := a.host; h != nil && h.Running() && h.Cloudflared != "" && !a.hostStarting && !a.tunnelRetry {
		a.tunnelRetry = true // hosting, but Cloudflare said no: ask it again
		go func() {
			ok := h.ShareViaCloudflare()
			a.do(func() {
				a.tunnelRetry = false
				if ok {
					a.log("Link for friends: " + a.link())
				}
			})
		}()
	}
}

func (a *App) hostStart() {
	if a.locked || a.hostStarting || (a.host != nil && a.host.Running()) {
		return
	}
	mediamtx := findTool("mediamtx")
	if mediamtx == "" {
		a.log("MediaMTX is missing (brew install mediamtx); it is what sends the video to viewers.")
		a.hostFailed, a.playing = "MediaMTX is missing", false
		return
	}
	cloudflared := findTool("cloudflared")
	if cloudflared == "" {
		a.log("cloudflared is missing (brew install cloudflared); the link will be a direct one.")
	}
	h := NewHost(a.log, mediamtx, cloudflared, a.standby)
	h.MapPorts = a.cfg.OpenRouterPorts
	h.Party = a.party
	h.DocAt = func(at string) { a.do(func() { a.docAt(at) }) }
	if a.hostSetup != nil {
		a.hostSetup(h)
	}
	a.host, a.hostStarting, a.hostFailed = h, true, ""
	go func() {
		err := h.Start()
		a.do(func() { a.hostReady(err) })
	}()
}

func (a *App) hostReady(err error) {
	a.hostStarting = false
	if err != nil {
		a.log("Hosting failed: " + err.Error())
		a.host, a.hostFailed, a.playing = nil, err.Error(), false
		return
	}
	a.log("Hosting. Link for friends: " + a.link())
	if a.host.URLs()["cloudflare"] == "" && a.host.Problem() != "" {
		a.log(a.host.Problem())
	}
	a.scheduleSent = ""
	a.sendSchedule()
}

// ---------- files that can't be played now ----------

// off: a row that can't play, greyed out: its file is gone, or ffmpeg couldn't read it when it was added
func off(it *Item) bool {
	return it.Missing || (it.Note != "" && it.Note != "didn't play")
}

// watchFiles looks every few seconds for files that have gone, or come back (a
// drive unplugged and plugged in again). Off the app's goroutine: a network
// drive that has stopped answering can hold a look at it up for a long time.
func (a *App) watchFiles() {
	for {
		var paths []string
		a.wait(func() {
			for _, it := range a.cfg.Queue {
				paths = append(paths, it.Path)
			}
		})
		gone := map[string]bool{}
		for _, p := range paths {
			if _, err := os.Stat(p); err != nil {
				gone[p] = true
			}
		}
		a.do(func() {
			for _, it := range a.cfg.Queue {
				it.Missing = gone[it.Path]
			}
		})
		time.Sleep(3 * time.Second)
	}
}

// ---------- the viewers' guide ----------

// schedule: what's on now and what follows, with start times once playing (epoch seconds)
func (a *App) schedule() []ScheduleRow {
	q, pos := a.cfg.Queue, a.cfg.Position
	rows := []ScheduleRow{}
	if len(q) == 0 || pos >= len(q) {
		return rows
	}
	gap := float64(max(0, int(a.cfg.Countdown))) + startGap
	var start *float64
	if a.player.Running() && a.current == q[pos] {
		if (a.phase == "movie" || a.phase == "doc") && a.moviePos != nil {
			s := float64(a.moviePos.at.UnixMilli())/1000 - a.moviePos.seconds // where minute 0 of this movie would have been
			start = &s
		} else if a.phase == "countdown" {
			s := float64(a.countdownEnd.UnixMilli())/1000 + startGap
			start = &s
		}
	}
	for _, it := range q[pos:] {
		r := ScheduleRow{Title: displayTitle(it.Path), Duration: int64(it.Duration + 0.5)}
		if start != nil {
			s := int64(*start + 0.5)
			r.Start = &s
		}
		if it.kind() == "pdf" {
			pages := it.Pages
			r.Pages = &pages
		}
		r.Data = it.kind() == "db"
		if it.Subs != nil && it.Subs.Mode == "viewers" && it.Subtitles != nil {
			for _, t := range *it.Subtitles {
				r.CC = r.CC || t.Text
			}
		}
		rows = append(rows, r)
		if start != nil {
			if it.isDoc() { // a document takes as long as the reading does: what follows it has no time yet
				start = nil
			} else {
				s := *start + it.Duration + gap
				start = &s
			}
		}
	}
	return rows
}

func (a *App) sendSchedule() {
	if a.host == nil || !a.host.Running() || a.hostStarting {
		return
	}
	rows := a.schedule()
	// send it when it changes: titles, or a start time moving by more than a few seconds (a seek)
	key := ""
	for _, r := range rows {
		start := "-"
		if r.Start != nil {
			start = strconv.FormatInt(*r.Start/5, 10)
		}
		key += fmt.Sprintf("%s|%d|%v|%s\n", r.Title, r.Duration, r.CC, start)
	}
	if key != a.scheduleSent {
		a.scheduleSent = key
		a.host.SetSchedule(rows)
	}
}

// ---------- quitting ----------

// beforeClose is Wails's OnBeforeClose: true keeps the app open
func (a *App) beforeClose(ctx context.Context) bool {
	var streaming bool
	a.wait(func() { streaming = a.player.Running() })
	if !streaming {
		return false
	}
	answer, err := runtime.MessageDialog(ctx, runtime.MessageDialogOptions{Type: runtime.QuestionDialog,
		Title: "Quit", Message: "Something is playing. Stop it and quit?", Buttons: []string{"Quit", "Cancel"},
		DefaultButton: "Quit", CancelButton: "Cancel"})
	return err != nil || answer != "Quit"
}

// shutdown stops ffmpeg and hosting; they run in their own process groups and would outlive us
func (a *App) shutdown(ctx context.Context) {
	var links map[string]string
	a.wait(func() {
		a.save()
		a.player.Stop()
		if a.host != nil {
			links = a.host.URLs()
			a.host.Stop() // router ports closed, session key gone
		}
		a.party.close()
		a.party = nil
	})
	if ctx != nil && len(links) > 0 { // and the link not left on the clipboard either
		if text, err := runtime.ClipboardGetText(ctx); err == nil {
			for _, l := range links {
				if text == l {
					runtime.ClipboardSetText(ctx, "")
				}
			}
		}
	}
}
