package main

// Host a TubeYap session from this Mac: no server anywhere but here.
//
// Viewers get a page from this Mac (WebRTC video, with HLS from here as the
// fallback, and chat). Every URL carries a random session key and nothing answers
// without it. The video goes straight from MediaMTX to each browser over UDP (or
// ICE-TCP); the page, handshake, fallback and chat are one HTTP port. Both are
// opened on the router by PortMapper. Chat lives only in memory.
//
// A Cloudflare quick tunnel (cloudflared, no account) gives an https link for
// viewers who can't reach the Mac directly; their page and handshake go through
// Cloudflare. With it, both ends also use Cloudflare's STUN server to learn their
// outside addresses, so WebRTC can punch through the routers and the video still
// comes straight here (HLS through the tunnel if it can't).

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

const (
	httpPort = 8765 // page, handshake, HLS fallback, chat
	icePort  = 8189 // WebRTC media, UDP and TCP
	// Only with the tunnel: tells each end its outside address so WebRTC can punch
	// through NAT. No media goes through it.
	stunServer = "stun:stun.cloudflare.com:3478"
	history    = 200 // chat lines kept for people who join late
	nameMax    = 30
	textMax    = 500
	// MediaMTX and cloudflared are started under this, so they stop when the app
	// does, even if the app is killed or crashes: the app holds the write end of
	// their stdin; when it goes, the watcher's read ends and it stops the tool. (A
	// shell gives background jobs /dev/null for stdin, hence the explicit fd 3.)
	watchdog = `exec 3<&0; "$@" 3<&- & child=$!; (read _ <&3; kill $child 2>/dev/null) & watcher=$!; ` +
		`exec 3<&-; wait $child; code=$?; kill $watcher 2>/dev/null; exit $code`
)

var assets = map[string]bool{"host.js": true, "host.css": true, "hls.min.js": true, "pdf.min.mjs": true, "pdf.worker.min.mjs": true}

// On every response: browsers keep no copy, nobody indexes it, no page it links to learns the address
var ephemeral = map[string]string{"Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive",
	"Referrer-Policy": "no-referrer"}

func freePort() int {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

// freeICEPort: a port free for both TCP and UDP, as MediaMTX's WebRTC media needs
func freeICEPort() int {
	for range 20 {
		port := freePort()
		if c, err := net.ListenPacket("udp", fmt.Sprintf(":%d", port)); err == nil {
			c.Close()
			return port
		}
	}
	return freePort()
}

func portOpen(port int) bool {
	c, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 500*time.Millisecond)
	if err == nil {
		c.Close()
	}
	return err == nil
}

// mediamtxConfig: MediaMTX listens only on loopback, apart from WebRTC media (the ICE port, on all interfaces)
func mediamtxConfig(ports map[string]int, publicIP, standby string, ice int) string {
	hosts := []string{}
	if publicIP != "" {
		hosts = append(hosts, publicIP)
	}
	h, _ := json.Marshal(hosts)
	s, _ := json.Marshal(standby)
	return fmt.Sprintf(`logLevel: warn
# Only what a hosted session uses; MediaMTX's other servers stay off so they
# neither take ports nor listen on the network
moq: no
metrics: no
pprof: no
playback: no
api: yes
apiAddress: 127.0.0.1:%d
rtmp: no
srt: no
rtsp: yes
rtspAddress: 127.0.0.1:%d
rtspTransports: [tcp]
hls: yes
hlsAddress: 127.0.0.1:%d
hlsVariant: fmp4
hlsSegmentDuration: 1s
hlsPartDuration: 200ms
webrtc: yes
webrtcAddress: 127.0.0.1:%d
webrtcLocalUDPAddress: :%d
webrtcLocalTCPAddress: :%d
webrtcIPsFromInterfaces: yes
webrtcAdditionalHosts: %s
webrtcICEServers2: []
authInternalUsers:
  - user: any
    pass:
    ips: ['127.0.0.1', '::1']
    permissions: [{action: publish}, {action: read}, {action: api}]
paths:
  live:
    source: publisher
    alwaysAvailable: yes
    alwaysAvailableFile: %s
`, ports["api"], ports["rtsp"], ports["hls"], ports["webrtc"], ice, ice, h, s)
}

// ---------- chat ----------

// chatConn is one viewer's socket. Everything sent to it goes through out, in
// order, written by its own goroutine, so a slow viewer holds nobody else up.
type chatConn struct {
	ws   *websocket.Conn
	out  chan []byte
	name string
}

func (c *chatConn) send(b []byte) {
	select {
	case c.out <- b:
	default: // hopelessly behind: it'll catch up from /status when it reconnects
		c.ws.Close()
	}
}

// write sends what's queued, and a ping every 20 seconds to keep it alive
func (c *chatConn) write(done <-chan struct{}) {
	t := time.NewTicker(20 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-done:
			return
		case b := <-c.out:
			c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if c.ws.WriteMessage(websocket.TextMessage, b) != nil {
				c.ws.Close()
				return
			}
		case <-t.C:
			c.ws.WriteControl(websocket.PingMessage, nil, time.Now().Add(10*time.Second))
		}
	}
}

// Chat is the in-memory chat for one session: who is here, and the last few hundred lines
type Chat struct {
	hello   func() map[string]any // more for the greeting: subtitles, the movie clock, the guide, a PDF
	mu      sync.Mutex
	conns   map[*chatConn]bool
	history []map[string]any
}

func (c *Chat) names() []string {
	seen := map[string]bool{}
	for conn := range c.conns {
		if conn.name != "" {
			seen[conn.name] = true
		}
	}
	names := []string{}
	for n := range seen {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}

func (c *Chat) sendAll(msg any) {
	b, _ := json.Marshal(msg)
	c.mu.Lock()
	conns := make([]*chatConn, 0, len(c.conns))
	for conn := range c.conns {
		conns = append(conns, conn)
	}
	c.mu.Unlock()
	for _, conn := range conns {
		conn.send(b)
	}
}

func (c *Chat) say(msg map[string]any) {
	msg["at"] = float64(time.Now().UnixMicro()) / 1e6
	c.mu.Lock()
	c.history = append(c.history, msg)
	if len(c.history) > history {
		c.history = c.history[len(c.history)-history:]
	}
	c.mu.Unlock()
	c.sendAll(msg)
}

func (c *Chat) online() {
	c.mu.Lock()
	names := c.names()
	c.mu.Unlock()
	c.sendAll(map[string]any{"type": "online", "online": names})
}

var upgrader = websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

func (c *Chat) handle(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	conn := &chatConn{ws: ws, out: make(chan []byte, 256)}
	c.mu.Lock()
	c.conns[conn] = true
	hello := map[string]any{"type": "hello", "history": append([]map[string]any{}, c.history...), "online": c.names()}
	c.mu.Unlock()
	for k, v := range c.hello() {
		hello[k] = v
	}
	b, _ := json.Marshal(hello)
	conn.send(b)
	done := make(chan struct{})
	go conn.write(done)

	ws.SetReadLimit(64 * 1024)
	ws.SetReadDeadline(time.Now().Add(45 * time.Second))
	ws.SetPongHandler(func(string) error { return ws.SetReadDeadline(time.Now().Add(45 * time.Second)) })
	defer func() {
		close(done)
		c.mu.Lock()
		delete(c.conns, conn)
		name := conn.name
		still := false
		for other := range c.conns {
			still = still || other.name == name
		}
		c.mu.Unlock()
		ws.Close()
		if name != "" && !still {
			c.say(map[string]any{"type": "system", "text": name + " left"})
			c.online()
		}
	}()

	var last time.Time
	for {
		kind, data, err := ws.ReadMessage()
		if err != nil {
			return
		}
		ws.SetReadDeadline(time.Now().Add(45 * time.Second))
		if kind != websocket.TextMessage {
			continue
		}
		var m map[string]any
		if json.Unmarshal(data, &m) != nil {
			continue
		}
		switch m["type"] {
		case "join":
			name := truncate(strings.TrimSpace(fmt.Sprint(valueOr(m["name"], ""))), nameMax)
			if name == "" {
				continue
			}
			c.mu.Lock()
			old := conn.name
			conn.name = name
			c.mu.Unlock()
			if old != name {
				text := name + " joined"
				if old != "" {
					text = old + " is now " + name
				}
				c.say(map[string]any{"type": "system", "text": text})
				c.online()
			}
		case "say":
			c.mu.Lock()
			name := conn.name
			c.mu.Unlock()
			text := truncate(strings.TrimSpace(fmt.Sprint(valueOr(m["text"], ""))), textMax)
			if name != "" && text != "" && time.Since(last) > 300*time.Millisecond { // a little flood control
				last = time.Now()
				c.say(map[string]any{"type": "msg", "name": name, "text": text})
			}
		}
	}
}

func (c *Chat) closeAll() {
	c.mu.Lock()
	conns := make([]*chatConn, 0, len(c.conns))
	for conn := range c.conns {
		conns = append(conns, conn)
	}
	c.mu.Unlock()
	for _, conn := range conns {
		conn.ws.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(1001, "host left"),
			time.Now().Add(2*time.Second))
		conn.ws.Close()
	}
}

func valueOr(v, or any) any {
	if v == nil {
		return or
	}
	return v
}

func truncate(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

// ---------- the host ----------

// SubTrack is a subtitle track handed to viewers; Cues are fetched separately
type SubTrack struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Lang    string `json:"lang"`
	Default bool   `json:"default"`
	Cues    []Cue  `json:"-"`
}

// ScheduleRow is a line of the viewers' guide: Start is epoch seconds, or nil before Play
type ScheduleRow struct {
	Title    string `json:"title"`
	Duration int64  `json:"duration"`
	Start    *int64 `json:"start"`
	Pages    *int   `json:"pages"`
	CC       bool   `json:"cc"`
}

type document struct {
	Token string `json:"token"`
	Path  string `json:"-"`
	Title string `json:"title"`
	Pages int    `json:"pages"`
	Page  int    `json:"page"`
}

type clock struct {
	token    string
	position float64
	at       time.Time
}

type Host struct {
	Log            func(string)
	MediaMTX       string
	Cloudflared    string // "" for no tunnel
	HTTPPort       int
	ICEPort        int
	MapPorts       bool // false: LAN (and tunnel) only, the router is left alone
	CleanLeftovers bool // false: a check running beside a real session leaves it alone
	Standby        []byte

	mu        sync.Mutex
	key       string
	ports     map[string]int
	urls      map[string]string
	problem   string // why friends outside may not get in
	mapper    *PortMapper
	chat      *Chat
	procs     []*exec.Cmd
	stdins    map[*exec.Cmd]io.WriteCloser
	exited    map[*exec.Cmd]chan struct{} // closed when the tool has gone
	mediamtx  *exec.Cmd
	tunnel    *exec.Cmd
	config    string
	stun      bool
	tmp       string
	server    *http.Server
	subsToken string
	subs      []SubTrack
	clock     *clock
	clockSent time.Time
	schedule  []ScheduleRow
	doc       *document

	tunnelURL        string
	tunnelRegistered time.Time
}

func NewHost(log func(string), mediamtx, cloudflared string, standby []byte) *Host {
	return &Host{Log: log, MediaMTX: mediamtx, Cloudflared: cloudflared, HTTPPort: httpPort, ICEPort: icePort,
		MapPorts: true, CleanLeftovers: true, Standby: standby, urls: map[string]string{}}
}

// Start takes a few seconds (the router, the tunnel); call it off the UI.
func (h *Host) Start() error {
	err := h.start()
	if err != nil {
		h.Stop() // don't leave MediaMTX or router ports behind
	}
	return err
}

func (h *Host) start() error {
	if h.CleanLeftovers {
		h.killLeftovers()
	}
	key := make([]byte, 16)
	rand.Read(key)
	tmp, err := os.MkdirTemp("", "tubeyap-host-")
	if err != nil {
		return err
	}
	h.mu.Lock()
	h.key = base64.RawURLEncoding.EncodeToString(key)
	h.chat = &Chat{hello: h.hello, conns: map[*chatConn]bool{}}
	h.ports = map[string]int{"api": freePort(), "rtsp": freePort(), "hls": freePort(), "webrtc": freePort()}
	h.tmp = tmp
	h.stdins = map[*exec.Cmd]io.WriteCloser{}
	h.exited = map[*exec.Cmd]chan struct{}{}
	h.mu.Unlock()

	public := ""
	gw := defaultGateway()
	lan := "127.0.0.1"
	if gw != nil {
		if ip := localIP(gw); ip != nil {
			lan = ip.String()
		}
	}
	if h.MapPorts {
		h.mapper = NewPortMapper(h.Log, gw)
		opened := h.mapper.Map(h.HTTPPort, "TCP")
		opened = h.mapper.Map(h.ICEPort, "UDP") && opened
		opened = h.mapper.Map(h.ICEPort, "TCP") && opened
		if h.mapper.PublicIP != "" && isPublic(h.mapper.PublicIP) {
			public = h.mapper.PublicIP
		}
		if opened && public != "" {
			h.Log(h.mapper.Describe())
		} else {
			h.problem = h.mapper.Describe()
		}
	}

	standby := filepath.Join(tmp, "standby_opus.mp4") // looped between movies
	if err := os.WriteFile(standby, h.Standby, 0o644); err != nil {
		return err
	}
	h.config = filepath.Join(tmp, "mediamtx.yml")
	if err := os.WriteFile(h.config, []byte(mediamtxConfig(h.ports, public, standby, h.ICEPort)), 0o644); err != nil {
		return err
	}
	if h.mediamtx, err = h.spawn("mediamtx", h.MediaMTX, h.config); err != nil {
		return fmt.Errorf("MediaMTX: %w", err)
	}
	if err := h.startWeb(); err != nil {
		return err
	}
	if err := waitFor(h.ports["api"], 10*time.Second); err != nil {
		return errors.New("MediaMTX did not start")
	}
	h.mu.Lock()
	h.urls = map[string]string{"lan": fmt.Sprintf("http://%s:%d/%s/", lan, h.HTTPPort, h.key)}
	if public != "" {
		h.urls["internet"] = fmt.Sprintf("http://%s:%d/%s/", public, h.HTTPPort, h.key)
	}
	h.mu.Unlock()
	if h.Cloudflared != "" {
		h.ShareViaCloudflare()
	}
	return nil
}

func (h *Host) Stop() {
	h.mu.Lock()
	h.mediamtx = nil // we are stopping it: no restart
	procs := h.procs
	h.procs = nil
	h.tunnel = nil
	server, chat, mapper, tmp := h.server, h.chat, h.mapper, h.tmp
	h.server, h.mapper, h.tmp = nil, nil, ""
	h.mu.Unlock()
	if mapper != nil {
		mapper.Close()
	}
	for _, p := range procs {
		stopGroup(p)
	}
	if chat != nil {
		chat.closeAll()
	}
	if server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		server.Shutdown(ctx)
		cancel()
	}
	if tmp != "" {
		os.RemoveAll(tmp)
	}
	h.mu.Lock()
	h.key, h.urls, h.doc = "", map[string]string{}, nil
	h.mu.Unlock()
}

// killLeftovers: a session that crashed or was force-quit leaves MediaMTX (and
// cloudflared) running, holding the ports. Ours are recognisable: MediaMTX runs a
// tubeyap-host-* config, cloudflared tunnels to our port. Only orphans go (parent
// 1: their app is gone); a live session's belong to its app, which may be another
// copy of this one, or a self-test running beside it.
func (h *Host) killLeftovers() {
	out, err := exec.Command("ps", "-axo", "pid=,ppid=,command=").Output()
	if err != nil {
		return
	}
	tunnel := fmt.Sprintf("tunnel --no-autoupdate --url http://127.0.0.1:%d", h.HTTPPort)
	for _, line := range strings.Split(string(out), "\n") {
		f := strings.Fields(line)
		if len(f) < 3 || f[1] != "1" {
			continue
		}
		cmd := strings.Join(f[2:], " ")
		if (strings.Contains(cmd, "mediamtx") && strings.Contains(cmd, "/tubeyap-host-") && strings.HasSuffix(cmd, "mediamtx.yml")) ||
			(strings.Contains(cmd, "cloudflared") && strings.HasSuffix(cmd, tunnel)) {
			h.Log("Stopping a leftover from an earlier session: " + filepath.Base(f[2]))
			var pid int
			fmt.Sscan(f[0], &pid)
			syscall.Kill(pid, syscall.SIGTERM)
		}
	}
	time.Sleep(300 * time.Millisecond)
	// and the folders crashed sessions left (their config; never a key), unless something still uses them
	out, err = exec.Command("ps", "-axo", "command=").Output()
	if err != nil {
		return
	}
	dirs, _ := filepath.Glob(filepath.Join(os.TempDir(), "tubeyap-host-*"))
	for _, d := range dirs {
		if !strings.Contains(string(out), d) {
			os.RemoveAll(d)
		}
	}
}

func (h *Host) Running() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.key != ""
}

func (h *Host) Key() string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.key
}

// URLs: "lan", and "internet" and "cloudflare" when there are those
func (h *Host) URLs() map[string]string {
	h.mu.Lock()
	defer h.mu.Unlock()
	u := map[string]string{}
	for k, v := range h.urls {
		u[k] = v
	}
	return u
}

func (h *Host) Problem() string { return h.problem }

// RTSPURL: where ffmpeg publishes
func (h *Host) RTSPURL() string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return fmt.Sprintf("rtsp://127.0.0.1:%d/live", h.ports["rtsp"])
}

func (h *Host) viewers() int {
	h.chat.mu.Lock()
	defer h.chat.mu.Unlock()
	return len(h.chat.conns)
}

// spawn runs a tool under the watchdog, in the session's folder (anything a tool
// writes beside itself, like MediaMTX's certificates, goes with the session)
func (h *Host) spawn(name, bin string, args ...string) (*exec.Cmd, error) {
	cmd := exec.Command("/bin/sh", append([]string{"-c", watchdog, "tubeyap-watch", bin}, args...)...)
	cmd.Dir = h.tmp
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	h.mu.Lock()
	h.procs = append(h.procs, cmd)
	h.stdins[cmd] = stdin // held open: when the app goes, so does this, and the watchdog stops the tool
	h.exited[cmd] = make(chan struct{})
	h.mu.Unlock()
	go h.drain(cmd, out, name, bin, args)
	return cmd, nil
}

var tunnelLink = regexp.MustCompile(`https://[a-z0-9-]+\.trycloudflare\.com`)

func (h *Host) drain(cmd *exec.Cmd, out io.Reader, name, bin string, args []string) {
	s := bufio.NewScanner(out)
	for s.Scan() {
		line := strings.TrimRight(s.Text(), " \r")
		if name == "cloudflared" { // chatty: watch for the link, pass on the errors
			h.mu.Lock()
			if m := tunnelLink.FindString(line); m != "" && !strings.HasPrefix(m, "https://api.") {
				h.tunnelURL = m
			}
			if strings.Contains(line, "Registered tunnel connection") && h.tunnelRegistered.IsZero() {
				h.tunnelRegistered = time.Now()
			}
			h.mu.Unlock()
			if _, after, ok := strings.Cut(line, " ERR "); ok {
				h.Log("cloudflared: " + after)
			} else if strings.Contains(line, "failed") { // "quick tunnel provisioning failed with status 429"
				h.Log("cloudflared: " + line)
			}
			continue
		}
		if line != "" {
			h.Log(name + ": " + line)
		}
	}
	err := cmd.Wait()
	h.mu.Lock()
	if done := h.exited[cmd]; done != nil {
		close(done)
		delete(h.exited, cmd)
	}
	restart := name == "mediamtx" && h.mediamtx == cmd && h.key != ""
	h.mu.Unlock()
	if restart {
		// died while we were hosting: bring it back on the same config, so the link keeps working
		h.Log(fmt.Sprintf("MediaMTX stopped unexpectedly (%v); restarting it.", err))
		time.Sleep(time.Second)
		h.mu.Lock()
		again := h.mediamtx == cmd && h.key != ""
		if again {
			h.procs = slices.DeleteFunc(h.procs, func(p *exec.Cmd) bool { return p == cmd })
		}
		h.mu.Unlock()
		if again {
			if c, err := h.spawn(name, bin, args...); err == nil {
				h.mu.Lock()
				h.mediamtx = c
				h.mu.Unlock()
			}
		}
	}
}

// stopGroup stops a watched tool and its watcher: they share a process group
func stopGroup(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	pid := cmd.Process.Pid
	if syscall.Kill(-pid, syscall.SIGTERM) != nil {
		return
	}
	for end := time.Now().Add(5 * time.Second); time.Now().Before(end); time.Sleep(100 * time.Millisecond) {
		if syscall.Kill(-pid, 0) != nil {
			return
		}
	}
	syscall.Kill(-pid, syscall.SIGKILL)
}

func waitFor(port int, timeout time.Duration) error {
	for end := time.Now().Add(timeout); time.Now().Before(end); time.Sleep(100 * time.Millisecond) {
		if portOpen(port) {
			return nil
		}
	}
	return errors.New("timed out")
}

// Waits between tries at a Cloudflare link. Quick tunnels need no account, and
// Cloudflare limits how many are made from one address: when it says no (a 429)
// it says so at once, and a little later it often says yes.
var tunnelRetries = []time.Duration{0, 5 * time.Second, 10 * time.Second, 20 * time.Second, 40 * time.Second}

// cfSettle: between the tunnel connecting and its link being handed out
var cfSettle = 6 * time.Second

// ShareViaCloudflare gets a Cloudflare quick-tunnel link, trying again while
// Cloudflare is turning requests away. It blocks until there's a link or the
// tries run out (false), or hosting stops.
func (h *Host) ShareViaCloudflare() bool {
	for i, wait := range tunnelRetries {
		if wait > 0 {
			h.Log(fmt.Sprintf("Cloudflare didn't give a link; trying again in %v.", wait))
			time.Sleep(wait)
		}
		if !h.Running() {
			return false
		}
		if h.tryTunnel() {
			return true
		}
		if i == len(tunnelRetries)-1 {
			h.Log("The Cloudflare tunnel did not come up.")
		}
	}
	return false
}

// tryTunnel starts cloudflared once. It hands the link out only once the tunnel
// is connected and its name has had a moment to be published: a lookup that comes
// too early is cached as "no such name" by the resolver (yours or a friend's), and
// the link then looks dead for a while.
func (h *Host) tryTunnel() bool {
	h.mu.Lock()
	h.tunnelURL, h.tunnelRegistered = "", time.Time{}
	h.mu.Unlock()
	tunnel, err := h.spawn("cloudflared", h.Cloudflared, "tunnel", "--no-autoupdate", "--url",
		fmt.Sprintf("http://127.0.0.1:%d", h.HTTPPort))
	if err != nil {
		h.Log("The Cloudflare tunnel did not start: " + err.Error())
		return false
	}
	h.mu.Lock()
	h.tunnel = tunnel
	gone := h.exited[tunnel]
	h.mu.Unlock()
	ready := false
	for end := time.Now().Add(20 * time.Second); time.Now().Before(end) && !ready; {
		select {
		case <-gone: // refused, or failed: cloudflared has said why
			end = time.Time{}
		case <-time.After(200 * time.Millisecond):
		}
		h.mu.Lock()
		ready = !h.tunnelRegistered.IsZero() && time.Since(h.tunnelRegistered) > cfSettle
		h.mu.Unlock()
	}
	h.mu.Lock()
	link := h.tunnelURL
	if ready && link != "" && h.key != "" {
		h.urls["cloudflare"] = link + "/" + h.key + "/"
	} else {
		ready = false
		h.procs = slices.DeleteFunc(h.procs, func(p *exec.Cmd) bool { return p == tunnel })
		h.tunnel = nil
	}
	h.mu.Unlock()
	if !ready {
		stopGroup(tunnel)
		return false
	}
	h.setStun(true)
	return true
}

// setStun tells MediaMTX (live, through its API) to use STUN; viewers get the same from /status
func (h *Host) setStun(on bool) {
	servers := []map[string]string{}
	if on {
		servers = append(servers, map[string]string{"url": stunServer})
	}
	body, _ := json.Marshal(map[string]any{"webrtcICEServers2": servers})
	req, _ := http.NewRequest(http.MethodPatch, fmt.Sprintf("http://127.0.0.1:%d/v3/config/global/patch", h.ports["api"]),
		bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		h.Log("Could not turn on STUN in MediaMTX: " + err.Error())
		return
	}
	resp.Body.Close()
	h.mu.Lock()
	h.stun = on
	h.mu.Unlock()
}

// ---------- subtitles viewers turn on themselves ----------
// The app hands over the tracks when a movie starts and the movie's position as
// ffmpeg reports it. Viewers get both over the chat socket (and /status), fetch a
// track's lines from /subs/<token>/<id>, and show them against the position, less
// their own delay. The position, not a wall clock: viewers' clocks differ.

func (h *Host) SetSubtitles(token string, tracks []SubTrack) {
	h.mu.Lock()
	h.subsToken, h.subs = token, tracks
	h.mu.Unlock()
	h.broadcast(h.subsJSON())
}

func (h *Host) ClearSubtitles() {
	h.mu.Lock()
	h.subsToken, h.subs, h.clock = "", nil, nil
	h.mu.Unlock()
	h.broadcast(h.subsJSON())
	h.broadcast(map[string]any{"type": "clock", "clock": nil})
}

func (h *Host) SetPosition(token string, position float64) {
	now := time.Now()
	h.mu.Lock()
	var expected *float64
	if h.clock != nil && h.clock.token == token {
		e := h.clock.position + now.Sub(h.clock.at).Seconds()
		expected = &e
	}
	h.clock = &clock{token, position, now}
	// tell viewers on a new movie, a jump (seek), or every so often to keep them true
	send := expected == nil || abs(*expected-position) > 1.0 || now.Sub(h.clockSent) > 10*time.Second
	if send {
		h.clockSent = now
	}
	h.mu.Unlock()
	if send {
		h.broadcast(map[string]any{"type": "clock", "clock": h.clockJSON()})
	}
}

func abs(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}

func (h *Host) clockJSON() any {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clock == nil {
		return nil
	}
	pos := h.clock.position + time.Since(h.clock.at).Seconds()
	return map[string]any{"token": h.clock.token, "position": float64(int64(pos*100+0.5)) / 100}
}

func (h *Host) subsJSON() map[string]any {
	h.mu.Lock()
	defer h.mu.Unlock()
	tracks := h.subs
	if tracks == nil {
		tracks = []SubTrack{}
	}
	var token any
	if h.subsToken != "" {
		token = h.subsToken
	}
	return map[string]any{"type": "subs", "token": token, "tracks": tracks}
}

// SetSchedule: what's on and next, now first. Sent with this Mac's own time, so
// viewers whose clocks are off still see the right times.
func (h *Host) SetSchedule(rows []ScheduleRow) {
	h.mu.Lock()
	h.schedule = rows
	h.mu.Unlock()
	h.broadcast(h.scheduleJSON())
}

func (h *Host) scheduleJSON() map[string]any {
	h.mu.Lock()
	defer h.mu.Unlock()
	rows := h.schedule
	if rows == nil {
		rows = []ScheduleRow{}
	}
	return map[string]any{"type": "schedule", "rows": rows, "now": float64(time.Now().UnixMicro()) / 1e6}
}

// ---------- a PDF read together ----------
// While a PDF is up the stream carries a card, and viewers' pages show the document
// itself over it, fetched from /doc/<token> (that file only, for as long as it is
// up), and turned to whatever page the host is on.

func (h *Host) SetDocument(token, path, title string, pages, page int) {
	h.mu.Lock()
	h.doc = &document{token, path, title, pages, page}
	h.mu.Unlock()
	h.broadcast(h.docJSON())
}

func (h *Host) SetPage(page int) {
	h.mu.Lock()
	changed := h.doc != nil && h.doc.Page != page
	if changed {
		h.doc.Page = page
	}
	h.mu.Unlock()
	if changed {
		h.broadcast(h.docJSON())
	}
}

func (h *Host) ClearDocument() {
	h.mu.Lock()
	had := h.doc != nil
	h.doc = nil
	h.mu.Unlock()
	if had {
		h.broadcast(h.docJSON())
	}
}

func (h *Host) docJSON() map[string]any {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.doc == nil {
		return map[string]any{"type": "doc", "doc": nil}
	}
	d := *h.doc
	return map[string]any{"type": "doc", "doc": d}
}

func (h *Host) hello() map[string]any {
	return map[string]any{"subs": h.subsJSON(), "clock": h.clockJSON(), "schedule": h.scheduleJSON(), "doc": h.docJSON()}
}

func (h *Host) broadcast(msg any) {
	h.mu.Lock()
	chat := h.chat
	h.mu.Unlock()
	if chat != nil {
		chat.sendAll(msg)
	}
}

// ---------- the viewer site ----------

// viewerFiles: the app bundle's Resources/host_web, read on every request, so a
// viewer-page fix can go live by copying files in; else the copy built into the app
func viewerFiles() fs.FS {
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Join(filepath.Dir(exe), "..", "Resources", "host_web")
		if _, err := os.Stat(filepath.Join(dir, "viewer.html")); err == nil {
			return os.DirFS(dir)
		}
	}
	web, _ := fs.Sub(hostWeb, "host_web")
	return web
}

func (h *Host) startWeb() error {
	web := viewerFiles()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{key}", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/"+r.PathValue("key")+"/", http.StatusFound)
	})
	mux.HandleFunc("GET /{key}/{$}", func(w http.ResponseWriter, r *http.Request) {
		page, _ := fs.ReadFile(web, "viewer.html")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(bytes.ReplaceAll(page, []byte("{{KEY}}"), []byte(h.Key())))
	})
	mux.HandleFunc("GET /{key}/assets/{name}", func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		b, err := fs.ReadFile(web, name)
		if !assets[name] || err != nil {
			http.NotFound(w, r)
			return
		}
		if strings.HasSuffix(name, ".js") || strings.HasSuffix(name, ".mjs") { // a module must come as JavaScript
			w.Header().Set("Content-Type", "text/javascript")
		} else {
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		}
		w.Write(b)
	})
	whep := h.whepProxy()
	mux.Handle("POST /{key}/whep", whep)
	mux.Handle("PATCH /{key}/whep/{session}", whep)
	mux.Handle("DELETE /{key}/whep/{session}", whep)
	mux.Handle("GET /{key}/hls/{tail...}", h.hlsProxy())
	mux.HandleFunc("GET /{key}/ws", func(w http.ResponseWriter, r *http.Request) { h.chat.handle(w, r) })
	mux.HandleFunc("GET /{key}/status", h.status)
	mux.HandleFunc("GET /{key}/subs/{token}/{id}", h.subsFile)
	mux.HandleFunc("GET /{key}/doc/{token}", h.docFile)

	l, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", h.HTTPPort))
	if err != nil {
		return fmt.Errorf("the viewer site did not start: %w", err)
	}
	h.mu.Lock()
	h.server = &http.Server{Handler: h.onlyWithKey(mux), ReadHeaderTimeout: 10 * time.Second}
	server := h.server
	h.mu.Unlock()
	go server.Serve(l)
	return nil
}

// onlyWithKey: nothing answers without the session key; a wrong one gets the same
// answer as a page that doesn't exist
func (h *Host) onlyWithKey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for k, v := range ephemeral {
			w.Header().Set(k, v)
		}
		key, _, _ := strings.Cut(strings.TrimPrefix(r.URL.Path, "/"), "/")
		want := h.Key()
		if want == "" || subtle.ConstantTimeCompare([]byte(key), []byte(want)) != 1 {
			http.NotFound(w, r)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
		next.ServeHTTP(w, r)
	})
}

// keep: only these response headers come back from MediaMTX
func keep(resp *http.Response, names ...string) {
	for k := range resp.Header {
		if !slices.Contains(names, http.CanonicalHeaderKey(k)) {
			resp.Header.Del(k)
		}
	}
}

// whepProxy: the WebRTC handshake, passed to MediaMTX (which only listens on loopback)
func (h *Host) whepProxy() http.Handler {
	return &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			tail := ""
			if s := r.In.PathValue("session"); s != "" {
				tail = "/" + s
			}
			r.Out.URL, _ = url.Parse(fmt.Sprintf("http://127.0.0.1:%d/live/whep%s", h.ports["webrtc"], tail))
			r.Out.Host = ""
			out := http.Header{}
			for _, k := range []string{"Content-Type", "If-Match"} {
				if v := r.In.Header.Get(k); v != "" {
					out.Set(k, v)
				}
			}
			r.Out.Header = out
		},
		ModifyResponse: func(resp *http.Response) error {
			loc := resp.Header.Get("Location")
			keep(resp, "Content-Type", "Etag", "Link", "Accept-Patch")
			if loc != "" {
				resp.Header.Set("Location", strings.Replace(loc, "/live/whep", "/"+h.Key()+"/whep", 1))
			}
			return nil
		},
	}
}

// hlsProxy: the fallback stream, passed to MediaMTX. MediaMTX keeps HLS viewers
// apart with cookies (cookieCheck, then hlsSession) marked Secure, which browsers
// drop over plain http. So the cookie check is answered here, and the session
// cookie goes back to the browser unflagged.
func (h *Host) hlsProxy() http.Handler {
	return &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			q := r.In.URL.Query()
			q.Set("cookieCheck", "1")
			r.Out.URL, _ = url.Parse(fmt.Sprintf("http://127.0.0.1:%d/live/%s?%s", h.ports["hls"], r.In.PathValue("tail"), q.Encode()))
			r.Out.Host = ""
			cookie := "cookieCheck=1"
			if c := r.In.Header.Get("Cookie"); c != "" {
				cookie += "; " + c
			}
			r.Out.Header = http.Header{"Cookie": {cookie}}
		},
		ModifyResponse: func(resp *http.Response) error {
			cookies := resp.Header.Values("Set-Cookie")
			keep(resp, "Content-Type")
			for _, c := range cookies {
				var kept []string
				for _, a := range strings.Split(c, ";") {
					switch strings.ToLower(strings.TrimSpace(a)) {
					case "secure", "partitioned", "samesite=none":
					default:
						kept = append(kept, a)
					}
				}
				resp.Header.Add("Set-Cookie", strings.Join(append(kept, " SameSite=Lax"), ";"))
			}
			return nil
		},
	}
}

func (h *Host) status(w http.ResponseWriter, r *http.Request) {
	var online *bool
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Get(fmt.Sprintf("http://127.0.0.1:%d/v3/paths/get/live", h.ports["api"]))
	if err == nil {
		var p struct {
			Online *bool `json:"online"`
		}
		if resp.StatusCode == 200 && json.NewDecoder(resp.Body).Decode(&p) == nil {
			online = p.Online
		}
		resp.Body.Close()
	}
	out := h.hello()
	out["standby"] = online != nil && !*online
	out["viewers"] = h.viewers()
	h.mu.Lock()
	ice := []map[string]string{}
	if h.stun {
		ice = append(ice, map[string]string{"urls": stunServer})
	}
	h.mu.Unlock()
	out["iceServers"] = ice
	writeJSON(w, out)
}

func (h *Host) subsFile(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	var cues []Cue
	found := false
	if r.PathValue("token") == h.subsToken && h.subsToken != "" {
		for _, t := range h.subs {
			if t.ID == r.PathValue("id") {
				cues, found = t.Cues, true
			}
		}
	}
	h.mu.Unlock()
	if !found {
		http.NotFound(w, r)
		return
	}
	if cues == nil {
		cues = []Cue{}
	}
	writeJSON(w, cues)
}

func (h *Host) docFile(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	d := h.doc
	h.mu.Unlock()
	if d == nil || r.PathValue("token") != d.Token {
		http.NotFound(w, r)
		return
	}
	f, err := os.Open(d.Path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	st, _ := f.Stat()
	w.Header().Set("Content-Type", "application/pdf")
	http.ServeContent(w, r, "", st.ModTime(), f)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(v)
}
