package main

// The pictures the host keeps for the pages: put in a document by a viewer,
// grabbed from the movie, or drawn by an app (the graffiti reel). A document
// holds "asset:<id>" (Tiny Little Office's picture fence, its docs/library.md),
// and the pages fetch img/<id>. They're written to PicturesDir, beside what
// the apps keep, and when hosting starts any that nothing kept names is gone.

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	_ "golang.org/x/image/webp"

	"github.com/ftrain/mouseparty/apps"
)

const (
	pictureMaxBytes = 10 << 20  // one picture
	picturesMax     = 400 << 20 // all of a session's, in memory
)

// what the pages may put in, by what the bytes are (never by what they say they are)
var pictureTypes = map[string]string{"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp"}

var (
	assetRef  = regexp.MustCompile(`asset:([0-9a-f]{16})\b`)
	pictureID = regexp.MustCompile(`^[0-9a-f]{16}$`)
	svgSize   = regexp.MustCompile(`<svg[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"`)
)

type picture struct {
	mime string
	b    []byte
}

type pictures struct {
	mu     sync.Mutex
	dir    string // "" keeps them in memory only
	mem    map[string]picture
	byHash map[[32]byte]string
	total  int
}

func newPictures(dir string) *pictures {
	return &pictures{dir: dir, mem: map[string]picture{}, byHash: map[[32]byte]string{}}
}

// put keeps b (of type mime) and says its reference and size; the same bytes twice are one picture
func (p *pictures) put(b []byte, mime string) (apps.Picture, error) {
	ext := pictureTypes[mime]
	if mime == "image/svg+xml" {
		ext = ".svg"
	}
	if ext == "" || len(b) > pictureMaxBytes {
		return apps.Picture{}, errors.New("not a picture the pages can have")
	}
	pic := apps.Picture{}
	if c, _, err := image.DecodeConfig(bytes.NewReader(b)); err == nil {
		pic.W, pic.H = c.Width, c.Height
	} else if m := svgSize.FindSubmatch(b); m != nil {
		fmt.Sscan(string(m[1]), &pic.W)
		fmt.Sscan(string(m[2]), &pic.H)
	}
	sum := sha256.Sum256(b)
	p.mu.Lock()
	defer p.mu.Unlock()
	if id, ok := p.byHash[sum]; ok {
		pic.Ref = "asset:" + id
		return pic, nil
	}
	if p.total+len(b) > picturesMax {
		return apps.Picture{}, errors.New("no room for more pictures this session")
	}
	raw := make([]byte, 8)
	rand.Read(raw)
	id := hex.EncodeToString(raw)
	p.mem[id] = picture{mime, b}
	p.byHash[sum] = id
	p.total += len(b)
	if p.dir != "" && os.MkdirAll(p.dir, 0o700) == nil {
		os.WriteFile(filepath.Join(p.dir, id+ext), b, 0o600)
	}
	pic.Ref = "asset:" + id
	return pic, nil
}

// get: the picture with that id, from memory or as kept
func (p *pictures) get(id string) (picture, bool) {
	if !pictureID.MatchString(id) {
		return picture{}, false
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if pic, ok := p.mem[id]; ok {
		return pic, true
	}
	if p.dir == "" {
		return picture{}, false
	}
	found, _ := filepath.Glob(filepath.Join(p.dir, id+".*"))
	for _, f := range found {
		b, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		mime := "image/svg+xml"
		for m, ext := range pictureTypes {
			if filepath.Ext(f) == ext {
				mime = m
			}
		}
		return picture{mime, b}, true
	}
	return picture{}, false
}

// prunePictures: the kept pictures nothing in keep (the apps' files) names any more go
func prunePictures(dir, keep string) {
	named := map[string]bool{}
	files, _ := filepath.Glob(filepath.Join(keep, "*.json"))
	for _, f := range files {
		b, _ := os.ReadFile(f)
		for _, m := range assetRef.FindAllSubmatch(b, -1) {
			named[string(m[1])] = true
		}
	}
	pics, _ := filepath.Glob(filepath.Join(dir, "*"))
	for _, f := range pics {
		if id := strings.TrimSuffix(filepath.Base(f), filepath.Ext(f)); !named[id] {
			os.Remove(f)
		}
	}
}

// ---------- the movie's frames, and the routes (web.go) ----------

// nowShowing: the movie playing, for frames from it
type nowShowing struct {
	path, title string
}

// SetShowing: the movie that's playing now ("" when none is)
func (h *Host) SetShowing(path, title string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if path == "" {
		h.showing = nil
	} else {
		h.showing = &nowShowing{path, title}
	}
}

// Frame: the frame on screen now, a PNG at most 1280 wide, cut from the file
// itself (not the stream, so it's as sharp as the movie is), square pixels
func (h *Host) Frame() ([]byte, apps.Picture, error) {
	h.mu.Lock()
	showing := h.showing
	h.mu.Unlock()
	at, playing := h.Position()
	if showing == nil || !playing {
		return nil, apps.Picture{}, errors.New("no movie is playing")
	}
	h.grabbing.Lock() // one ffmpeg at a time
	defer h.grabbing.Unlock()
	ctx, cancel := contextTimeout(15 * time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, firstTool("ffmpeg"), "-v", "error", "-nostdin", "-ss", fmt.Sprintf("%.3f", at),
		"-i", showing.path, "-frames:v", "1", "-an", "-sn",
		"-vf", "scale=trunc(iw*sar/2)*2:ih,setsar=1,scale='min(1280,iw)':-2", "-f", "image2", "-update", "1", "-c:v", "png", "pipe:1").Output()
	if err != nil || len(out) == 0 {
		return nil, apps.Picture{}, fmt.Errorf("no frame: %v", err)
	}
	pic := apps.Picture{At: at, Title: showing.title}
	if c, _, err := image.DecodeConfig(bytes.NewReader(out)); err == nil {
		pic.W, pic.H = c.Width, c.Height
	}
	return out, pic, nil
}

// Keep: a picture an app made (apps.Movie)
func (h *Host) Keep(b []byte, mime string) (apps.Picture, error) { return h.pics.put(b, mime) }

// postPicture: a viewer's picture, for a document
func (h *Host) postPicture(w http.ResponseWriter, r *http.Request) {
	b, err := readAll(r)
	if err != nil {
		http.Error(w, "too big", http.StatusRequestEntityTooLarge)
		return
	}
	pic, err := h.pics.put(b, http.DetectContentType(b))
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnsupportedMediaType)
		return
	}
	writeJSON(w, pic)
}

// grab: the frame on screen now, kept, for a viewer to put in a document
func (h *Host) grab(w http.ResponseWriter, r *http.Request) {
	b, pic, err := h.Frame()
	if err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	kept, err := h.pics.put(b, "image/png")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInsufficientStorage)
		return
	}
	pic.Ref = kept.Ref
	writeJSON(w, pic)
}

func (h *Host) getPicture(w http.ResponseWriter, r *http.Request) {
	pic, ok := h.pics.get(r.PathValue("id"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", pic.mime)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// an SVG opened on its own runs nothing, and reaches for nothing but what's in it
	w.Header().Set("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox")
	w.Write(pic.b)
}

func readAll(r *http.Request) ([]byte, error) {
	var buf bytes.Buffer
	_, err := buf.ReadFrom(r.Body)
	return buf.Bytes(), err
}
