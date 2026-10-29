package main

// The viewer site: one HTTP port, the session key in every path.

import (
	"bytes"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/ftrain/openhouseparty/apps"
)

var assets = map[string]bool{"host.js": true, "host.css": true, "hls.min.js": true, "pdf.min.mjs": true, "pdf.worker.min.mjs": true}

// On every response: browsers keep no copy, nobody indexes it, no page it links to learns the address
var ephemeral = map[string]string{"Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive",
	"Referrer-Policy": "no-referrer"}

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
	mux.HandleFunc("GET /{key}/apps/{name}", func(w http.ResponseWriter, r *http.Request) { // an app's script
		name, _ := strings.CutSuffix(r.PathValue("name"), ".js")
		b, err := fs.ReadFile(web, "apps/"+name+".js")
		if _, known := apps.Lookup(name); (!known && name != "lib" && name != "icons") || err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/javascript")
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
