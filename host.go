package main

// Host a Mouse Party session from this Mac: no server anywhere but here.
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
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/ftrain/mouseparty/apps"
)

const (
	httpPort = 8765 // page, handshake, HLS fallback, chat
	icePort  = 8189 // WebRTC media, UDP and TCP
	// MediaMTX and cloudflared are started under this, so they stop when the app
	// does, even if the app is killed or crashes: the app holds the write end of
	// their stdin; when it goes, the watcher's read ends and it stops the tool. (A
	// shell gives background jobs /dev/null for stdin, hence the explicit fd 3.)
	watchdog = `exec 3<&0; "$@" 3<&- & child=$!; (read _ <&3; kill $child 2>/dev/null) & watcher=$!; ` +
		`exec 3<&-; wait $child; code=$?; kill $watcher 2>/dev/null; exit $code`
)

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

// ---------- the host ----------

type Host struct {
	Log            func(string)
	MediaMTX       string
	Cloudflared    string // "" for no tunnel
	HTTPPort       int
	ICEPort        int
	MapPorts       bool // false: LAN (and tunnel) only, the router is left alone
	CleanLeftovers bool // false: a check running beside a real session leaves it alone
	Standby        []byte
	Party          *party          // where apps (apps.Keeper) and the pictures they name are kept (store.go); nil nowhere
	DocAt          func(at string) // viewers went to another page of the database up (SetAt)

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
	data      *dataDB // the database up, open read-only (data.go)
	apps      *appHost
	pics      *pictures
	showing   *nowShowing
	grabbing  sync.Mutex
	pandoc    *wasmTool     // documents brought in are read by it (pandoc.go)
	reading   chan struct{} // one at a time

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
	tmp, err := os.MkdirTemp("", "mouseparty-host-")
	if err != nil {
		return err
	}
	h.mu.Lock()
	h.key = base64.RawURLEncoding.EncodeToString(key)
	h.chat = &Chat{conns: map[*chatConn]bool{}}
	env := apps.Env{Movie: h}
	if h.Party != nil {
		h.Party.prunePictures()
		env.Shelf = h.Party
	}
	env.Reel = apps.NewReel(env.Shelf)
	h.pics = newPictures(h.Party)
	if h.pandoc == nil {
		h.pandoc, h.reading = newWasmTool("pandoc"), make(chan struct{}, 1)
	}
	h.apps = newAppHost(h.chat, env)
	h.chat.hello = h.greeting
	h.chat.app, h.chat.appControl = h.apps.message, h.apps.control
	h.chat.joined, h.chat.left = h.apps.joined, h.apps.left
	h.chat.docAt = h.SetAt
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
	if h.apps != nil {
		h.apps.closeAll()
	}
	h.pandoc.close()
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
	if h.data != nil {
		h.data.Close()
		h.data = nil
	}
	h.mu.Unlock()
}

// killLeftovers: a session that crashed or was force-quit leaves MediaMTX (and
// cloudflared) running, holding the ports. Ours are recognisable: MediaMTX runs a
// mouseparty-host-* config, cloudflared tunnels to our port. Only orphans go (parent
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
		if (strings.Contains(cmd, "mediamtx") && strings.Contains(cmd, "/mouseparty-host-") && strings.HasSuffix(cmd, "mediamtx.yml")) ||
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
	dirs, _ := filepath.Glob(filepath.Join(os.TempDir(), "mouseparty-host-*"))
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
	cmd := exec.Command("/bin/sh", append([]string{"-c", watchdog, "mouseparty-watch", bin}, args...)...)
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
