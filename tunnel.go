package main

// The Cloudflare quick tunnel: an https link that works from anywhere.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"slices"
	"time"
)

// Only with the tunnel: tells each end its outside address so WebRTC can punch
// through NAT. No media goes through it.
const stunServer = "stun:stun.cloudflare.com:3478"

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
