package main

import (
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ncruces/go-sqlite3"
)

// selftest is `MouseParty --selftest`: host from this Mac (router untouched), check the
// page, the stand-by stream and the WebRTC handshake answer, publish a short
// countdown, and stop. 0 if it all worked. For checking a build, here or in CI.
func selftest() int {
	// its own ports and no cleanup, so it can run while the app is hosting a real session
	h := NewHost(func(s string) { fmt.Println(s) }, firstTool("mediamtx"), "", standby)
	h.HTTPPort, h.ICEPort, h.MapPorts, h.CleanLeftovers = freePort(), freeICEPort(), false, false
	ok := true
	check := func(what string, fn func() (string, error)) {
		result, err := fn()
		if err != nil {
			ok = false
			fmt.Printf("FAIL  %s: %v\n", what, err)
			return
		}
		fmt.Printf("ok    %s: %s\n", what, result)
	}
	defer h.Stop()
	if err := h.Start(); err != nil {
		fmt.Printf("FAIL  hosting: %v\nself-test FAILED\n", err)
		return 1
	}
	base := h.URLs()["lan"]
	check("viewer page", func() (string, error) { return statusIs(base, 200) })
	check("wrong key is refused", func() (string, error) { return statusIs(strings.Replace(base, h.Key(), "nope", 1), 404) })
	check("stand-by HLS playlist", func() (string, error) { return statusIs(base+"hls/index.m3u8", 200) })
	check("WebRTC handshake answers", func() (string, error) {
		resp, err := http.Post(base+"whep", "application/sdp", strings.NewReader("not an offer"))
		if err != nil {
			return "", err
		}
		resp.Body.Close()
		if resp.StatusCode != 400 {
			return "", fmt.Errorf("status %d, not 400", resp.StatusCode)
		}
		return "400", nil
	})
	check("pdf.js comes as JavaScript", func() (string, error) { return typeIs(base+"assets/pdf.worker.min.mjs", "text/javascript") })
	check("apps' scripts come as JavaScript", func() (string, error) { return typeIs(base+"apps/graffiti.js", "text/javascript") })
	check("only apps' scripts", func() (string, error) { return statusIs(base+"apps/nope.js", 404) })
	check("the documents' editors come as JavaScript", func() (string, error) { return typeIs(base+"office/editors.js", "text/javascript") })
	check("documents are drawn by office.js", func() (string, error) { return typeIs(base+"apps/office.js", "text/javascript") })
	if pythonHome() == "" {
		fmt.Println("skip  Datasette: this build has no Python (scripts/build_python.sh)")
	} else if db, err := selftestDB(); err == nil {
		h.SetDocument(document{Token: "t2", Path: db, Title: "Self-test", Kind: "db"})
		check("a database up is Datasette's to show", func() (string, error) {
			resp, err := http.Get(base + "data/t2/selftest/films")
			if err != nil {
				return "", err
			}
			b, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			if resp.StatusCode != 200 || !strings.Contains(string(b), "Vertigo") || !strings.Contains(string(b), "type: 'went'") {
				return "", fmt.Errorf("status %d: %.200s", resp.StatusCode, b)
			}
			return "its table, and everyone following", nil
		})
		h.ClearDocument()
		os.Remove(db)
	}
	if pdf, err := os.CreateTemp("", "mouseparty-*.pdf"); err == nil {
		pdf.WriteString("%PDF-1.4\n%%EOF\n")
		pdf.Close()
		h.SetDocument(document{Token: "t1", Path: pdf.Name(), Title: "Self-test", Kind: "pdf", Pages: 1, Page: 1})
		check("the PDF up now is served", func() (string, error) { return typeIs(base+"doc/t1", "application/pdf") })
		check("no other is", func() (string, error) { return statusIs(base+"doc/t0", 404) })
		h.ClearDocument()
		os.Remove(pdf.Name())
	}
	exited := make(chan int, 1)
	p := &Player{Log: func(string) {}, OnExit: func(code int) { exited <- code }}
	args, temps := countdownCommand(4, "Self-test", StreamOpts{URL: h.RTSPURL(), Bitrate: "1500k", Preset: "veryfast"})
	check("countdown published (ffmpeg -> MediaMTX)", func() (string, error) {
		if err := p.Start(args, temps, 0, ""); err != nil {
			return "", err
		}
		for range 30 {
			var s struct {
				Standby bool `json:"standby"`
			}
			if resp, err := http.Get(base + "status"); err == nil {
				json.NewDecoder(resp.Body).Decode(&s)
				resp.Body.Close()
				if !s.Standby {
					return "publishing", nil
				}
			}
			time.Sleep(200 * time.Millisecond)
		}
		return "", fmt.Errorf("the countdown never went live")
	})
	select {
	case <-exited:
	case <-time.After(15 * time.Second):
		p.Stop()
	}
	if ok {
		fmt.Println("self-test passed")
		return 0
	}
	fmt.Println("self-test FAILED")
	return 1
}

// selftestDB: a small database to put up
func selftestDB() (string, error) {
	path := filepath.Join(os.TempDir(), "selftest.db")
	os.Remove(path)
	c, err := sqlite3.Open(path)
	if err != nil {
		return "", err
	}
	defer c.Close()
	return path, c.Exec(`CREATE TABLE films (title TEXT, year INT); INSERT INTO films VALUES ('Vertigo', 1958)`)
}

func statusIs(url string, want int) (string, error) {
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	if resp.StatusCode != want {
		return "", fmt.Errorf("status %d, not %d", resp.StatusCode, want)
	}
	return fmt.Sprint(want), nil
}

func typeIs(url, want string) (string, error) {
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	kind, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if kind != want {
		return "", fmt.Errorf("%s, not %s", kind, want)
	}
	return kind, nil
}
