package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ftrain/openhouseparty/apps"
	"github.com/gorilla/websocket"
)

// A document over the chat sockets: one viewer's edit is the next version for
// everyone, an edit made against an older one is sent back to try again
func TestDocumentOverChat(t *testing.T) {
	h := &Host{}
	h.chat = &Chat{conns: map[*chatConn]bool{}}
	h.apps = newAppHost(h.chat, apps.Env{Movie: h})
	h.chat.hello = h.greeting
	h.chat.app, h.chat.appControl = h.apps.message, h.apps.control
	h.chat.joined, h.chat.left = h.apps.joined, h.apps.left
	srv := httptest.NewServer(http.HandlerFunc(h.chat.handle))
	defer srv.Close()
	defer h.apps.closeAll()
	dial := func() *websocket.Conn {
		ws, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
		if err != nil {
			t.Fatal(err)
		}
		return ws
	}
	next := func(ws *websocket.Conn, match func(map[string]any) bool) map[string]any {
		for {
			ws.SetReadDeadline(time.Now().Add(3 * time.Second))
			var m map[string]any
			if err := ws.ReadJSON(&m); err != nil {
				t.Fatal(err)
			}
			if match(m) {
				return m
			}
		}
	}
	appKind := func(kind string) func(map[string]any) bool {
		return func(m map[string]any) bool { return m["type"] == "app" && m["kind"] == kind }
	}

	a, b := dial(), dial()
	a.WriteJSON(map[string]any{"type": "app_open", "name": "write"})
	opened := next(b, func(m map[string]any) bool { return m["type"] == "apps" && m["op"] == "open" })["app"].(map[string]any)
	if opened["script"] != "office" || opened["view"].(map[string]any)["app"] != "write" {
		t.Fatal(opened)
	}
	id := opened["id"]
	typed := []any{map[string]any{"op": "text", "at": 0, "from": 0, "to": 0, "runs": []any{map[string]any{"t": "Rosebud"}}}}
	a.WriteJSON(map[string]any{"type": "app", "id": id, "kind": "edit", "base": 0, "eid": "a:1", "ops": typed})
	if m := next(b, appKind("ops")); m["seq"] != 1.0 || m["eid"] != "a:1" {
		t.Fatal(m)
	}
	b.WriteJSON(map[string]any{"type": "app", "id": id, "kind": "edit", "base": 0, "eid": "b:1", "ops": typed})
	if m := next(b, appKind("retry")); m["eid"] != "b:1" {
		t.Fatal(m)
	}
}

// Pictures in and out, the same bytes kept once; frames cut from the movie playing
func TestPicturesAndFrames(t *testing.T) {
	h := &Host{pics: newPictures(t.TempDir())}
	var img bytes.Buffer
	pic := image.NewRGBA(image.Rect(0, 0, 40, 30))
	pic.Set(1, 1, color.White)
	png.Encode(&img, pic)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /img", h.postPicture)
	mux.HandleFunc("GET /img/{id}", h.getPicture)
	mux.HandleFunc("POST /grab", h.grab)
	srv := httptest.NewServer(mux)
	defer srv.Close()
	post := func(path string, body []byte) (int, apps.Picture) {
		r, err := http.Post(srv.URL+path, "application/octet-stream", bytes.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		var p apps.Picture
		json.NewDecoder(r.Body).Decode(&p)
		return r.StatusCode, p
	}
	code, p1 := post("/img", img.Bytes())
	_, p2 := post("/img", img.Bytes())
	if code != 200 || !strings.HasPrefix(p1.Ref, "asset:") || p1.W != 40 || p1.H != 30 || p1.Ref != p2.Ref {
		t.Fatal(code, p1, p2)
	}
	if code, _ := post("/img", []byte("<svg onload=alert(1)>")); code != http.StatusUnsupportedMediaType {
		t.Fatal("took an SVG from a viewer:", code)
	}
	r, _ := http.Get(srv.URL + "/img/" + strings.TrimPrefix(p1.Ref, "asset:"))
	if r.StatusCode != 200 || r.Header.Get("Content-Type") != "image/png" || r.Header.Get("Content-Security-Policy") == "" {
		t.Fatal(r.StatusCode, r.Header)
	}
	h.pics = newPictures(h.pics.dir) // a new session: from the disk
	if _, ok := h.pics.get(strings.TrimPrefix(p1.Ref, "asset:")); !ok {
		t.Fatal("not kept")
	}

	if code, _ := post("/grab", nil); code != http.StatusConflict {
		t.Fatal("a frame with no movie:", code)
	}
	if findTool("ffmpeg") == "" {
		t.Skip("needs ffmpeg")
	}
	clip := filepath.Join(t.TempDir(), "clip.mkv")
	if out, err := exec.Command(findTool("ffmpeg"), "-v", "error", "-f", "lavfi", "-i", "testsrc=s=720x480:r=30:d=4",
		"-vf", "setsar=32/27", "-c:v", "libx264", clip).CombinedOutput(); err != nil {
		t.Fatal(err, string(out))
	}
	h.SetShowing(clip, "Clip")
	h.clock = &clock{"t", 2, time.Now()}
	code, f := post("/grab", nil)
	if code != 200 || f.W != 852 || f.H != 480 || f.Title != "Clip" || f.At < 2 || !strings.HasPrefix(f.Ref, "asset:") {
		t.Fatal(code, fmt.Sprintf("%+v", f)) // 720x480 at 32:27 is 852x480 (rounded to even) in square pixels
	}
}

// When hosting starts, the pictures nothing kept names are gone
func TestPrunePictures(t *testing.T) {
	keep, dir := t.TempDir(), t.TempDir()
	p := newPictures(dir)
	a, _ := p.put([]byte("\x89PNG\r\n\x1a\nkept"), "image/png")
	b, _ := p.put([]byte("\x89PNG\r\n\x1a\ngone"), "image/png")
	writeFile(t, filepath.Join(keep, "write.json"), `{"text":"`+"```image\\n"+a.Ref+"\\n```"+`"}`)
	prunePictures(dir, keep)
	q := newPictures(dir)
	if _, ok := q.get(strings.TrimPrefix(a.Ref, "asset:")); !ok {
		t.Fatal("pruned one a document names")
	}
	if _, ok := q.get(strings.TrimPrefix(b.Ref, "asset:")); ok {
		t.Fatal("kept one nothing names")
	}
}

func writeFile(t *testing.T, path, text string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}
