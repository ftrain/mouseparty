package main

// The viewer site as a process of its own, in a sandbox (sandbox.go).
//
// Everything a viewer's browser talks to (the pages, chat, the apps, pandoc and
// Datasette reading what viewers send and ask) is the same code as ever (web.go,
// chat.go, apps/), but run by a second copy of this program, started with --site
// inside a box: it can read the app's own pages and tools, write its own
// temporary folder, answer on the site's port and reach MediaMTX, and that is
// all. It can't open a file in the home folder, start a program, or reach
// anything else on this Mac or the network. So someone who finds a hole in the
// site has the session (the chat, the document that's up), and not the Mac.
//
// The app stays outside, since it must read whatever is dragged into it, and
// never reads a byte a viewer sent except through the few calls here:
//
//	the app tells the site (SiteCalls)   what's on: subtitles, the position, the
//	                                     guide, the document up (its file handed
//	                                     over open: the site can't open one), and
//	                                     when to stop
//	the site asks the app (MacCalls)     to keep and fetch what apps and documents
//	                                     keep in the party file, for a frame of the
//	                                     movie, and tells it what viewers did that
//	                                     the window shows (a page turned, a name)
//
// What the site asks is checked here as a stranger's would be: it may have been
// taken over. Both ways are Go's net/rpc over a socket pair the two were born
// with; when the app goes, the site's end closes and it stops. A site that dies
// is started again on the same port and told again what's on; viewers' pages
// reconnect by themselves (the chat so far is gone with it).

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	netrpc "net/rpc"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/ftrain/mouseparty/apps"
)

const (
	siteArg     = "--site"
	siteAnswer  = 15 * time.Second // any one call to it; past that it's stuck, and stopped
	keptMax     = 64 << 20         // one thing an app keeps
	siteLogMax  = 2000             // a line of its log
	siteFastMax = 3                // times it may stop as soon as it starts before it's left stopped
)

// ---------- what goes between them ----------

type SiteSetup struct {
	Key            string
	Ports          map[string]int // MediaMTX's
	Tmp            string         // its own temporary folder
	Canary         string         // a file it must not be able to read: it checks its box is on
	Kept           bool           // there's a party file: apps and pictures are kept
	Pandoc, Python string         // the tools it runs, where the app found them ("" none)
	Stun           bool
	MaxViewers     int
}

// SiteTell: one thing the app tells the site (Do says which; the rest as it needs)
type SiteTell struct {
	Do       string
	Token    string
	Tracks   []SubTrack
	Position float64
	Rows     []ScheduleRow
	Doc      document
	File     bool // the document's file comes beside this, open
	Page     int
	Playing  apps.Playing
	On       bool
}

// GobEncode: a guide row goes as its JSON (gob would lose a 0 behind a pointer)
func (r ScheduleRow) GobEncode() ([]byte, error) {
	type plain ScheduleRow
	return json.Marshal(plain(r))
}

func (r *ScheduleRow) GobDecode(b []byte) error {
	type plain ScheduleRow
	return json.Unmarshal(b, (*plain)(r))
}

// SiteEvent: something viewers did, for the app
type SiteEvent struct {
	Kind string // log, arrived, docAt, docPages, turned, paced
	Text string
	N    int
}

type SiteKept struct {
	Name string
	B    []byte
	OK   bool
}

type SitePicture struct {
	ID, Mime string
	B        []byte
	OK       bool
}

type SiteFrame struct {
	PNG []byte
	Pic apps.Picture
	Err string
}

// None: nothing to say (gob wants a field)
type None struct{ X bool }

// ---------- in the app ----------

// siteProc: the site's process, as the app sees it
type siteProc struct {
	h     *Host
	cmd   *exec.Cmd
	calls *netrpc.Client
	files *net.UnixConn // the documents' files go over this, open
	mu    sync.Mutex    // one thing told at a time, in order
	done  chan struct{} // closed when it has gone
	began time.Time
	kept  atomic.Int64 // bytes of pictures it has put in the party file
}

// socketPair: two ends of a socket, for the app and the site
func socketPair(kind int) (ours net.Conn, theirs *os.File, err error) {
	syscall.ForkLock.RLock()
	fds, err := syscall.Socketpair(syscall.AF_UNIX, kind, 0)
	if err == nil {
		syscall.CloseOnExec(fds[0])
		syscall.CloseOnExec(fds[1])
	}
	syscall.ForkLock.RUnlock()
	if err != nil {
		return nil, nil, err
	}
	f := os.NewFile(uintptr(fds[0]), "site")
	ours, err = net.FileConn(f)
	f.Close()
	return ours, os.NewFile(uintptr(fds[1]), "site"), err
}

// startSite: the site's port taken here (so it's this that says if it can't be), and the site started to answer on it
func (h *Host) startSite() error {
	l, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", h.HTTPPort))
	if err != nil {
		return fmt.Errorf("the viewer site did not start: %w", err)
	}
	h.mu.Lock()
	h.listener = l
	h.mu.Unlock()
	return h.launchSite()
}

func (h *Host) launchSite() error {
	h.mu.Lock()
	l, tmp, ports, key, stun := h.listener, h.tmp, h.ports, h.key, h.stun
	h.mu.Unlock()
	if l == nil || key == "" {
		return errors.New("hosting stopped")
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	listening, err := l.(*net.TCPListener).File()
	if err != nil {
		return err
	}
	defer listening.Close()
	toSite, siteIn, err := socketPair(syscall.SOCK_STREAM)
	if err != nil {
		return err
	}
	defer siteIn.Close()
	fromSite, siteOut, err := socketPair(syscall.SOCK_STREAM)
	if err != nil {
		return err
	}
	defer siteOut.Close()
	files, siteFiles, err := socketPair(syscall.SOCK_DGRAM)
	if err != nil {
		return err
	}
	defer siteFiles.Close()

	own := filepath.Join(tmp, "site")
	canary := filepath.Join(tmp, "outside")
	os.MkdirAll(own, 0o700)
	os.WriteFile(canary, []byte("the site must not be able to read this\n"), 0o600)
	cache := wasmCacheFor(true) // the site's own: nothing outside its box loads from it (wasm.go)
	if cache != "" && os.MkdirAll(cache, 0o755) != nil {
		cache = ""
	}
	setup := SiteSetup{Key: key, Ports: ports, Tmp: realPath(own), Canary: canary, Kept: h.Party != nil,
		Pandoc: findWasm("pandoc"), Python: pythonHome(), Stun: stun, MaxViewers: h.MaxViewers}
	if setup.Pandoc != "" {
		setup.Pandoc = realPath(setup.Pandoc)
	}
	resources := filepath.Join(filepath.Dir(exe), "..", "Resources") // the app's own: the pages, the tools
	if st, err := os.Stat(resources); err != nil || !st.IsDir() {
		resources = ""
	}
	cmd := siteBox(exe, h.HTTPPort, ports, []string{resources, setup.Pandoc, setup.Python}, []string{own, cache}).command(nil, siteArg)
	cmd.Dir = own
	cmd.Env = append(os.Environ(), "TMPDIR="+setup.Tmp)
	cmd.ExtraFiles = []*os.File{listening, siteIn, siteOut, siteFiles} // 3, 4, 5, 6 there (siteMain)
	said := &lineLog{log: h.Log, prefix: "site: "}                     // anything it prints: a crash
	cmd.Stdout, cmd.Stderr = said, said
	if err := cmd.Start(); err != nil {
		toSite.Close()
		fromSite.Close()
		files.Close()
		return fmt.Errorf("the viewer site did not start: %w", err)
	}
	s := &siteProc{h: h, cmd: cmd, calls: netrpc.NewClient(toSite), files: files.(*net.UnixConn), done: make(chan struct{}), began: time.Now()}
	asked := netrpc.NewServer()
	asked.RegisterName("Mac", &MacCalls{h: h, s: s})
	go asked.ServeConn(fromSite)
	go func() {
		err := cmd.Wait()
		close(s.done)
		s.calls.Close()
		files.Close()
		h.siteGone(s, err)
	}()
	if err := s.call("Site.Start", setup); err != nil {
		cmd.Process.Kill()
		return fmt.Errorf("the viewer site did not start: %w", err)
	}
	h.mu.Lock()
	h.site = s
	// what's on, for a site started again part-way through
	token, tracks, clock, rows, playing := h.subsToken, h.subs, h.clock, h.schedule, h.playing
	var doc *document
	if h.doc != nil {
		d := *h.doc
		doc = &d
	}
	h.mu.Unlock()
	if token != "" {
		s.tell(SiteTell{Do: "subs", Token: token, Tracks: tracks})
	}
	if clock != nil {
		s.tell(SiteTell{Do: "position", Token: clock.token, Position: clock.position + time.Since(clock.at).Seconds()})
	}
	if rows != nil {
		s.tell(SiteTell{Do: "schedule", Rows: rows})
	}
	if playing != (apps.Playing{}) {
		s.tell(SiteTell{Do: "playing", Playing: playing})
	}
	if doc != nil {
		s.tell(SiteTell{Do: "doc", Doc: *doc})
	}
	return nil
}

// siteBox: what the site may do (sandbox.go): read the app's own pages and tools, write its own
// folder and the cache of compiled tools, answer on the site's port, and of all this Mac's
// ports reach only MediaMTX's (not its RTSP one: the site publishes nothing)
func siteBox(exe string, port int, ports map[string]int, reads, writes []string) *box {
	b := newBox(exe).read(reads...).write(writes...).allow(
		fmt.Sprintf(`(allow network-bind network-inbound (local tcp "*:%d"))`, port))
	for _, name := range []string{"api", "hls", "webrtc"} {
		b.allow(fmt.Sprintf(`(allow network-outbound (remote tcp "localhost:%d"))`, ports[name]))
	}
	return b
}

// siteGone: the site's process ended. While hosting, that's a crash: it's started again.
func (h *Host) siteGone(s *siteProc, err error) {
	h.mu.Lock()
	ours := h.site == s && h.key != ""
	if ours {
		h.site = nil
		if time.Since(s.began) < 10*time.Second {
			h.siteFast++
		} else {
			h.siteFast = 0
		}
	}
	fast := h.siteFast
	h.mu.Unlock()
	if !ours {
		return
	}
	if fast >= siteFastMax {
		h.Log(fmt.Sprintf("The viewer site keeps stopping (%v). Stop and Play to try again.", err))
		return
	}
	h.Log(fmt.Sprintf("The viewer site stopped unexpectedly (%v); starting it again.", err))
	time.Sleep(time.Second)
	if err := h.launchSite(); err != nil && h.Running() {
		h.Log(err.Error())
	}
}

// call: one call to the site, answered in time or the site is stopped (and started again: siteGone)
func (s *siteProc) call(method string, args any) error {
	c := s.calls.Go(method, args, &None{}, make(chan *netrpc.Call, 1))
	select {
	case <-c.Done:
		return c.Error
	case <-s.done:
		return errors.New("the viewer site has stopped")
	case <-time.After(siteAnswer):
		s.cmd.Process.Kill()
		return errors.New("the viewer site didn't answer")
	}
}

// tell: one thing told to the site, after the last. A document's file goes with it, open (the site
// could open nothing by its path), and of the path only the name.
func (s *siteProc) tell(t SiteTell) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if t.Do == "doc" {
		if f, err := os.Open(t.Doc.Path); err == nil {
			if st, err := f.Stat(); err == nil && st.Mode().IsRegular() {
				_, _, err = s.files.WriteMsgUnix([]byte(t.Doc.Token), syscall.UnixRights(int(f.Fd())), nil)
				t.File = err == nil
			}
			f.Close()
		}
		t.Doc.Path = filepath.Base(t.Doc.Path)
	}
	return s.call("Site.Tell", t)
}

// stop: the site told to end its session (its apps keep what they hold, through MacCalls), then ended
func (s *siteProc) stop() {
	s.tell(SiteTell{Do: "stop"})
	s.cmd.Process.Kill()
	select {
	case <-s.done:
	case <-time.After(5 * time.Second):
	}
}

// tell: when the site is a process of its own, it's told (true); what the app's Host holds is then only
// what it would tell a site started again
func (h *Host) tell(t SiteTell) bool {
	h.mu.Lock()
	s := h.site
	h.mu.Unlock()
	if s == nil {
		return false
	}
	if err := s.tell(t); err != nil && h.Running() {
		h.Log("The viewer site wasn't told (" + t.Do + "): " + err.Error())
	}
	return true
}

// MacCalls: what the site asks of the app. The site is where strangers' bytes go, so what it
// asks is checked as theirs would be: names and sizes, and nothing that names a file.
type MacCalls struct {
	h *Host
	s *siteProc
}

func keptName(name string) bool {
	_, ok := apps.Lookup(name)
	return ok || name == "reel"
}

func (m *MacCalls) Event(e SiteEvent, _ *None) error {
	h := m.h
	if !utf8.ValidString(e.Text) {
		return errors.New("not text")
	}
	switch e.Kind {
	case "log":
		if len(e.Text) > siteLogMax {
			e.Text = e.Text[:siteLogMax]
		}
		h.Log(strings.Map(func(r rune) rune {
			if r < ' ' {
				return ' '
			}
			return r
		}, e.Text))
	case "arrived":
		if h.Arrived != nil && utf8.RuneCountInString(e.Text) <= nameMax {
			h.Arrived(e.Text)
		}
	case "docAt":
		if len(e.Text) > docAtMax || !strings.HasPrefix(e.Text, "/") {
			return errors.New("not a page")
		}
		h.mu.Lock()
		ok := h.doc != nil && h.doc.Kind == "db"
		if ok {
			h.doc.At = e.Text
		}
		h.mu.Unlock()
		if ok && h.DocAt != nil {
			h.DocAt(e.Text)
		}
	case "docPages":
		h.mu.Lock()
		ok := h.doc != nil && h.doc.Kind == "text" && e.N >= 1 && e.N <= pagesMax
		if ok {
			h.doc.Pages = e.N
			h.doc.Page = max(1, min(h.doc.Page, e.N))
		}
		h.mu.Unlock()
		if ok && h.DocPages != nil {
			h.DocPages(e.N)
		}
	case "turned":
		h.mu.Lock()
		ok := h.doc.paged() && e.N >= 1 && e.N <= h.doc.Pages
		h.mu.Unlock()
		if ok && h.Turned != nil {
			h.Turned(e.N)
		}
	case "paced":
		if h.Paced != nil {
			h.Paced()
		}
	}
	return nil
}

func (m *MacCalls) Load(name string, r *SiteKept) error {
	if m.h.Party == nil || !keptName(name) {
		return nil
	}
	r.B, r.OK = m.h.Party.Load(name)
	return nil
}

func (m *MacCalls) Save(k SiteKept, _ *None) error {
	if m.h.Party == nil || !keptName(k.Name) || len(k.B) > keptMax {
		return errors.New("not kept")
	}
	return m.h.Party.Save(k.Name, k.B)
}

func (m *MacCalls) PutPicture(p SitePicture, _ *None) error {
	if _, ok := pictureTypes[p.Mime]; !ok && p.Mime != "image/svg+xml" {
		return errors.New("not a picture")
	}
	if m.h.Party == nil || !pictureID.MatchString(p.ID) || len(p.B) > pictureMaxBytes {
		return errors.New("not a picture")
	}
	if m.s.kept.Add(int64(len(p.B))) > picturesMax {
		return errors.New("no room for more pictures this session")
	}
	return m.h.Party.putPicture(p.ID, p.Mime, p.B)
}

func (m *MacCalls) Picture(id string, r *SitePicture) error {
	if m.h.Party == nil || !pictureID.MatchString(id) {
		return nil
	}
	pic, ok := m.h.Party.picture(id)
	r.Mime, r.B, r.OK = pic.mime, pic.b, ok
	return nil
}

func (m *MacCalls) Frame(_ None, r *SiteFrame) error {
	png, pic, err := m.h.Frame()
	if err != nil {
		r.Err = err.Error()
		return nil
	}
	r.PNG, r.Pic = png, pic
	return nil
}

// ---------- in the site's process ----------

// siteSide: the site's process: the session it holds, and its way back to the app
type siteSide struct {
	h      *Host
	l      net.Listener
	mac    *netrpc.Client
	events chan SiteEvent
	mu     sync.Mutex
	handed map[string]*os.File // documents' files, by the document's token, until they're taken
}

// siteMain is `MouseParty --site`: the viewer site, until the app goes. Started only by the app
// (launchSite), which hands it the site's port (3) and its three sockets (4, 5, 6).
func siteMain() int {
	inSiteBox = true
	conn := func(fd uintptr) net.Conn {
		f := os.NewFile(fd, "app")
		c, err := net.FileConn(f)
		f.Close()
		if err != nil {
			fmt.Fprintln(os.Stderr, "the site is started by the app, not by hand:", err)
			os.Exit(2)
		}
		return c
	}
	listening := os.NewFile(3, "site")
	l, err := net.FileListener(listening)
	listening.Close()
	if err != nil {
		fmt.Fprintln(os.Stderr, "the site is started by the app, not by hand:", err)
		return 2
	}
	told, asks, files := conn(4), conn(5), conn(6)
	s := &siteSide{l: l, mac: netrpc.NewClient(asks), events: make(chan SiteEvent, 1024), handed: map[string]*os.File{}}
	go s.takeFiles(files.(*net.UnixConn))
	go func() { // what viewers did, to the app in the order it happened, holding nothing up here
		for e := range s.events {
			s.mac.Call("Mac.Event", e, &None{})
		}
	}()
	calls := netrpc.NewServer()
	calls.RegisterName("Site", &SiteCalls{s})
	calls.ServeConn(told) // until the app goes
	return 0
}

func (s *siteSide) event(kind, text string, n int) {
	select {
	case s.events <- SiteEvent{Kind: kind, Text: text, N: n}:
	default: // the app isn't taking them: it has stopped, or is about to stop us
	}
}

// takeFiles: each document's file arrives open, named by the document's token
func (s *siteSide) takeFiles(c *net.UnixConn) {
	name, oob := make([]byte, 256), make([]byte, syscall.CmsgSpace(4*4))
	for {
		n, oobn, _, _, err := c.ReadMsgUnix(name, oob)
		if err != nil {
			return
		}
		msgs, _ := syscall.ParseSocketControlMessage(oob[:oobn])
		for _, m := range msgs {
			fds, _ := syscall.ParseUnixRights(&m)
			for _, fd := range fds {
				syscall.CloseOnExec(fd)
				s.mu.Lock()
				if old := s.handed[string(name[:n])]; old != nil {
					old.Close()
				}
				s.handed[string(name[:n])] = os.NewFile(uintptr(fd), "document")
				s.mu.Unlock()
			}
		}
	}
}

// file: the file handed over for the document with this token (it was sent before the document was told)
func (s *siteSide) file(token string) *os.File {
	for end := time.Now().Add(3 * time.Second); time.Now().Before(end); time.Sleep(5 * time.Millisecond) {
		s.mu.Lock()
		f := s.handed[token]
		delete(s.handed, token)
		s.mu.Unlock()
		if f != nil {
			return f
		}
	}
	return nil
}

// what the site keeps in the party file, through the app: an apps.Shelf and a pictureKeeper
func (s *siteSide) Load(name string) ([]byte, bool) {
	var k SiteKept
	s.mac.Call("Mac.Load", name, &k)
	return k.B, k.OK
}

func (s *siteSide) Save(name string, b []byte) error {
	return s.mac.Call("Mac.Save", SiteKept{Name: name, B: b}, &None{})
}

func (s *siteSide) putPicture(id, mime string, b []byte) error {
	return s.mac.Call("Mac.PutPicture", SitePicture{ID: id, Mime: mime, B: b}, &None{})
}

func (s *siteSide) picture(id string) (picture, bool) {
	var p SitePicture
	s.mac.Call("Mac.Picture", id, &p)
	return picture{p.Mime, p.B}, p.OK
}

func (s *siteSide) frame() ([]byte, apps.Picture, error) {
	var f SiteFrame
	if err := s.mac.Call("Mac.Frame", None{}, &f); err != nil {
		return nil, apps.Picture{}, err
	}
	if f.Err != "" {
		return nil, apps.Picture{}, errors.New(f.Err)
	}
	return f.PNG, f.Pic, nil
}

// SiteCalls: what the app tells the site
type SiteCalls struct{ s *siteSide }

// Start: the session, answering on the port the site was born with
func (c *SiteCalls) Start(setup SiteSetup, _ *None) error {
	s := c.s
	if s.h != nil {
		return errors.New("started already")
	}
	if _, err := os.ReadFile(setup.Canary); err == nil {
		return errors.New("it isn't in its sandbox, and won't answer strangers without one")
	}
	h := &Host{HTTPPort: s.l.Addr().(*net.TCPAddr).Port, urls: map[string]string{}, mac: s,
		key: setup.Key, ports: setup.Ports, tmp: setup.Tmp, stun: setup.Stun, MaxViewers: setup.MaxViewers}
	h.Log = func(line string) { s.event("log", line, 0) }
	h.DocAt = func(at string) { s.event("docAt", at, 0) }
	h.DocPages = func(pages int) { s.event("docPages", "", pages) }
	h.Turned = func(page int) { s.event("turned", "", page) }
	h.Paced = func() { s.event("paced", "", 0) }
	h.Arrived = func(name string) { s.event("arrived", name, 0) }
	h.pandoc, h.reading = &wasmTool{name: "pandoc", path: setup.Pandoc}, make(chan struct{}, 1)
	if setup.Python != "" {
		h.python, h.pyHome = &wasmTool{name: "python", path: filepath.Join(setup.Python, "python.wasm")}, setup.Python
	}
	var shelf apps.Shelf
	var keep pictureKeeper
	if setup.Kept {
		shelf, keep = s, s
	}
	h.session(shelf, keep)
	s.h = h
	h.serve(s.l)
	return nil
}

func (c *SiteCalls) Tell(t SiteTell, _ *None) error {
	h := c.s.h
	if h == nil {
		return errors.New("not started")
	}
	switch t.Do {
	case "subs":
		h.SetSubtitles(t.Token, t.Tracks)
	case "nosubs":
		h.ClearSubtitles()
	case "position":
		h.SetPosition(t.Token, t.Position)
	case "schedule":
		h.SetSchedule(t.Rows)
	case "doc":
		if t.File {
			t.Doc.file = c.s.file(t.Doc.Token)
		}
		if t.Doc.file == nil {
			t.Doc.Path = "" // its file couldn't be opened by the app: there's nothing here to open either
		}
		h.SetDocument(t.Doc)
	case "page":
		h.SetPage(t.Page)
	case "nodoc":
		h.ClearDocument()
	case "endpace":
		h.EndPace()
	case "playing":
		h.setPlaying(t.Playing)
	case "stun":
		h.mu.Lock()
		h.stun = t.On
		h.mu.Unlock()
	case "stop":
		h.endSession()
	}
	return nil
}
