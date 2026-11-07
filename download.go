package main

// A download link (Party > Add Download Link…): a movie, or a song, a document
// or a database, by its URL, as a file service hands one out. It goes in the
// list at once, as a row with a download arrow counting its bytes, and the file
// comes down into this Mac's cache, ~/Library/Caches/Mouse Party/downloads. A
// movie plays while it comes: as soon as ffmpeg can read what's there (its
// length known, a few MB in) the row can be played, and when playback reaches
// the end of what's downloaded the app waits for more and goes on from there
// (App.finished, resumeDownloading), the slider reaching only as far as the
// bytes do. Once it's all there, the row is looked at as a dropped file is
// (ffmpeg, subtitles, pages) and plays from the cache as often as wanted. The
// app's ffmpeg speaks no https and a link may run out, so the file is fetched
// once, here, in Go, written straight to its place (Item.Got says when it's whole).
//
// Each link has its own folder, named by a hash of the link, so names can't
// collide; the same link twice is one row. Removing the row deletes its folder,
// and at start every folder no row names is deleted: nothing is kept but
// what's listed. A download the app quit in the middle of goes on from where
// it was (Range) next time; one that failed is tried again at the next start,
// or when its row is double-clicked.
//
// The cache has a limit, cache_gb in the settings (0: none): a link bigger than
// it is refused, and when a download would take the cache past it, the oldest
// downloads (by when they last played) are deleted first, their rows staying,
// greyed, for a double-click to fetch again. Party > Clear Download Cache… does
// that to every download at once.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync/atomic"
	"time"
	"unicode"
)

const (
	downloadMaxBytes = 64 << 30         // past this, it isn't a movie
	downloadStall    = 90 * time.Second // no bytes for this long: the link is dead
)

// download: one under way, on its Item (never kept)
type download struct {
	cancel     context.CancelFunc
	got, total int64  // bytes so far, and the file's size (0: the server didn't say)
	ready      bool   // ffmpeg reads what's there: it plays while it downloads
	refused    string // stopped by the app itself (too big for the cache): the row's note
}

// downloadsDir: where downloads live ("" when there's no cache folder)
func downloadsDir() string {
	d, err := os.UserCacheDir()
	if err != nil {
		return ""
	}
	return filepath.Join(d, "Mouse Party", "downloads")
}

// downloadKey: a link's folder, a hash of it (nothing of the link readable in the folder's name)
func downloadKey(link string) string {
	sum := sha256.Sum256([]byte(link))
	return hex.EncodeToString(sum[:8])
}

// checkLink: a web link, as the sheet should have it, or why not; a login written into it
// (https://user:pass@…) is taken out, and said apart
func checkLink(link string) (*url.URL, *siteLogin, string) {
	u, err := url.Parse(strings.TrimSpace(link))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" {
		return nil, nil, "That isn't a web link: it starts with http:// or https://"
	}
	u.Fragment = ""
	var login *siteLogin
	if u.User != nil {
		pass, _ := u.User.Password()
		login = &siteLogin{User: u.User.Username(), Pass: pass}
		u.User = nil
	}
	return u, login, ""
}

// linkName: a file name for the link: the last part of its path, as the server would name it
func linkName(u *url.URL) string {
	parts := strings.Split(strings.TrimRight(u.Path, "/"), "/")
	name, _ := url.PathUnescape(parts[len(parts)-1])
	return cleanName(name)
}

// cleanName: a name the server gave, made safe as a file's: no path in it, no leading dot, no control characters
func cleanName(name string) string {
	name = filepath.Base(strings.ReplaceAll(strings.ReplaceAll(name, "\\", "/"), "\x00", ""))
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, name)
	name = strings.TrimLeft(strings.TrimSpace(name), ".")
	if name == "" || name == "/" {
		name = "download"
	}
	if len(name) > 200 {
		name = name[len(name)-200:]
	}
	return name
}

// dispositionName: the name Content-Disposition gives, if it gives one
func dispositionName(resp *http.Response) string {
	_, params, err := mime.ParseMediaType(resp.Header.Get("Content-Disposition"))
	if err != nil || params["filename"] == "" {
		return ""
	}
	return cleanName(params["filename"])
}

// fetch brings the link down to path (its folder made), straight into the file, so that it
// can be played as it comes, going on from where an earlier try stopped. It says each step:
// the path, once the server has named the file (which may change it), and the bytes as
// they come. Returns the path.
func fetch(ctx context.Context, link, path string, login *siteLogin, step func(path string, got, total int64)) (string, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return path, err
	}
	var start int64
	if st, err := os.Stat(path); err == nil {
		start = st.Size()
	}
	req, err := http.NewRequestWithContext(ctx, "GET", link, nil)
	if err != nil {
		return path, err
	}
	req.Header.Set("User-Agent", "Mouse Party")
	if start > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", start))
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = downloadStall
	client := &http.Client{Transport: transport}
	if login != nil {
		client.Transport = withLogin{transport, siteOf(req.URL.Hostname()), *login}
	}
	resp, err := client.Do(req)
	if err != nil {
		return path, errors.New(shortNetError(err))
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusRequestedRangeNotSatisfiable && start > 0: // what's there is stale: from the top
		os.Remove(path)
		return fetch(ctx, link, path, login, step)
	case resp.StatusCode == http.StatusPartialContent && start > 0:
	case resp.StatusCode == http.StatusOK:
		start = 0
	case resp.StatusCode == http.StatusUnauthorized && login == nil:
		return path, fmt.Errorf("%s wants a login: add the link again with its username and password", siteOf(req.URL.Hostname()))
	case resp.StatusCode == http.StatusUnauthorized:
		return path, fmt.Errorf("%s turned down the login for %s: add the link again with the right username and password", siteOf(req.URL.Hostname()), login.User)
	default:
		return path, fmt.Errorf("the server said %s", resp.Status)
	}
	if name := dispositionName(resp); name != "" && name != filepath.Base(path) {
		next := filepath.Join(filepath.Dir(path), name)
		os.Rename(path, next)
		path = next
	}
	total := int64(0)
	if resp.ContentLength >= 0 {
		total = start + resp.ContentLength
	}
	if total > downloadMaxBytes {
		return path, fmt.Errorf("too big: %s", formatBytes(total))
	}
	step(path, start, total)
	flags := os.O_WRONLY | os.O_CREATE | os.O_APPEND
	if start == 0 {
		flags |= os.O_TRUNC
	}
	f, err := os.OpenFile(path, flags, 0o644)
	if err != nil {
		return path, err
	}
	// a link gone quiet is given up on: the read is cut after downloadStall without a byte
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	var stalled, big atomic.Bool
	stall := time.AfterFunc(downloadStall, func() { stalled.Store(true); cancel() })
	defer stall.Stop()
	got, last := start, time.Now()
	_, err = io.Copy(f, &progress{r: resp.Body, write: func(n int) {
		got += int64(n)
		stall.Reset(downloadStall)
		if got > downloadMaxBytes {
			big.Store(true)
			cancel()
		}
		if time.Since(last) > 400*time.Millisecond {
			last = time.Now()
			step(path, got, total)
		}
	}})
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	switch {
	case err != nil && big.Load():
		return path, fmt.Errorf("too big: past %s", formatBytes(downloadMaxBytes))
	case err != nil && stalled.Load():
		return path, errors.New("the link stopped sending")
	case errors.Is(err, io.ErrUnexpectedEOF):
		return path, fmt.Errorf("cut short at %s of %s", formatBytes(got), formatBytes(total))
	case err != nil:
		return path, errors.New(shortNetError(err))
	}
	if total > 0 && got != total {
		return path, fmt.Errorf("cut short at %s of %s", formatBytes(got), formatBytes(total))
	}
	step(path, got, got)
	return path, nil
}

// progress: a reader that says how many bytes went by
type progress struct {
	r     io.Reader
	write func(n int)
}

func (p *progress) Read(b []byte) (int, error) {
	n, err := p.r.Read(b)
	if n > 0 {
		p.write(n)
	}
	return n, err
}

// shortNetError: Go's net errors, without the wrapping ("Get \"https://…\": dial tcp …")
func shortNetError(err error) string {
	var uerr *url.Error
	if errors.As(err, &uerr) {
		err = uerr.Err
	}
	text := err.Error()
	switch {
	case errors.Is(err, context.Canceled):
		return "stopped"
	case strings.Contains(text, "no such host"):
		return "no such site"
	case strings.Contains(text, "connection refused"):
		return "the site refused the connection"
	case errors.Is(err, context.DeadlineExceeded) || strings.Contains(text, "timeout"):
		return "the site didn't answer"
	}
	return text
}

// ---------- the app's side ----------

// AddURL: Party > Add Download Link…: the link's file as a row at the end of the list, downloading;
// "" or why not. A username (and its password), or one written into the link, is kept as the login for
// the link's site (logins.go); a link already in the list given one is tried again with it.
func (a *App) AddURL(link, user, pass string) string {
	u, login, why := checkLink(link)
	if why != "" {
		return why
	}
	if user = strings.TrimSpace(user); user != "" {
		login = &siteLogin{User: user, Pass: pass}
	}
	if login != nil && !loginSafe(u) {
		return "A login goes only over https: the link starts with http://, so its password would cross the network as it is"
	}
	result := ""
	a.wait(func() {
		switch {
		case a.locked:
			result = "The party is sealed: open it first"
		case downloadsDir() == "":
			result = "There's no cache folder to download into"
		default:
			if login != nil {
				a.setLogin(siteOf(u.Hostname()), *login)
				a.log("Kept the login for " + siteOf(u.Hostname()) + " (" + login.User + ")")
			}
			for _, it := range a.cfg.Queue {
				if it.URL == u.String() {
					if login != nil && it.downloading() { // added again with a login: tried again with it
						a.stopDownload(it)
						a.retryDownload(it)
						return
					}
					result = "That link is in the list already"
					return
				}
			}
			it := &Item{URL: u.String(), Path: filepath.Join(downloadsDir(), downloadKey(u.String()), linkName(u))}
			it.Kind = kindOf(it.Path)
			a.editQueue(func(q []*Item) []*Item { return append(q, it) }, nil)
			a.log("Downloading " + filepath.Base(it.Path) + " from " + u.Hostname())
			a.startDownload(it)
			if a.host == nil || !a.host.Running() {
				a.hostStart()
			}
		}
	})
	return result
}

// downloading: a row that isn't a whole file yet: its download is under way, or waiting to be tried again
func (it *Item) downloading() bool { return it.URL != "" && !it.Got }

// ready: downloading, and far enough in that ffmpeg plays it
func (it *Item) ready() bool { return it.dl != nil && it.dl.ready }

// downloadedSeconds: how far into a movie playing as it downloads the bytes reach, about (its
// bitrate taken as even), a little short; false when that can't be told
func downloadedSeconds(it *Item) (float64, bool) {
	if !it.ready() || it.dl.total <= 0 || it.Duration <= 0 {
		return 0, false
	}
	return max(0, it.Duration*float64(it.dl.got)/float64(it.dl.total)*0.95-5), true
}

// startDownload begins (or goes on with) the item's download, off the app's goroutine; done fills the row in
func (a *App) startDownload(it *Item) {
	if !it.downloading() || it.dl != nil {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	d := &download{cancel: cancel}
	login := a.loginFor(it.URL)
	it.dl, it.Note, it.Cleared = d, "", false
	go func() {
		ready, lookAt := false, int64(-1) // whether it plays yet, and the bytes at which to look next
		path, err := fetch(ctx, it.URL, it.Path, login, func(path string, got, total int64) {
			if !ready && got > 0 && lookAt < 0 {
				lookAt = max(16<<10, min(4<<20, total/20)) // a few MB in, or a twentieth of a small one
			}
			if !ready && lookAt > 0 && got >= lookAt && (total == 0 || got < total) && kindOf(path) != "pdf" && kindOf(path) != "text" && kindOf(path) != "db" {
				if info := probe(path); info.Error == "" && info.Duration > 0 { // ffmpeg reads it, and knows how long it is
					ready = true
					it := it
					a.do(func() {
						if it.dl != d {
							return
						}
						d.ready, it.Duration, it.Kind = true, info.Duration, "video"
						if info.Audio != "" && info.Video == "" {
							it.Kind = "audio"
						}
						applyFound(it, findTracks(it))
						a.save()
						a.log(filepath.Base(path) + " can play while it downloads.")
					})
				} else {
					if lookAt < 1<<20 {
						a.log(fmt.Sprintf("%s can't play yet (%s; %s long); looking again further in.", filepath.Base(path), info.Error, formatTime(info.Duration)))
					}
					lookAt = got*2 + 1<<20 // not yet (a header still coming, or its length at the end of the file): later
				}
			}
			a.do(func() {
				if it.dl != d {
					return
				}
				sized := d.total == 0 && total > 0
				d.got, d.total = got, total
				if it.Path != path { // the server named it: the part is under that name now
					it.Path = path
					a.save()
				}
				if sized { // the first word of its size: room for it, or not
					a.makeRoom(it, total)
				}
			})
		})
		var made *Item
		if err == nil {
			made = downloadedItem(path, a.log)
		}
		a.do(func() {
			if it.dl != d { // removed meanwhile
				return
			}
			it.dl, it.Path = nil, path
			if d.refused != "" { // too big for the cache: nothing of it kept (even if all of it came before the cancel did)
				it.Note = d.refused
				os.RemoveAll(filepath.Dir(path))
			} else if err != nil {
				it.Note = "couldn't download: " + err.Error()
				a.log("Couldn't download " + filepath.Base(path) + ": " + err.Error())
			} else {
				it.Got, it.Missing = true, false
				it.Kind, it.Duration, it.Note, it.Pages, it.Page, it.Size = made.Kind, made.Duration, made.Note, made.Pages, made.Page, made.Size
				it.Subtitles, it.Audio = made.Subtitles, nil
				if it.Subs == nil {
					it.Subs = made.Subs
				}
				a.log(fmt.Sprintf("Downloaded %s (%s)", filepath.Base(path), formatBytes(d.got)))
			}
			a.save()
		})
	}()
}

// downloadedItem: the file as a dropped one would be looked at; a name ffmpeg isn't asked about by its extension is tried
func downloadedItem(path string, log func(string)) *Item {
	if !shareable(path) && !playable(path) {
		return &Item{Path: path, Note: "not a video, sound, document or database"}
	}
	if it := fileItem(path, log); it != nil {
		return it
	}
	return &Item{Path: path, Note: "not a SQLite database"}
}

// stopDownload gives up on the item's download (its row removed)
func (a *App) stopDownload(it *Item) {
	if it.dl != nil {
		it.dl.cancel()
		it.dl = nil
	}
}

// retryDownload: a failed download's row double-clicked: once more
func (a *App) retryDownload(it *Item) {
	if it.downloading() && it.dl == nil {
		a.log("Downloading " + filepath.Base(it.Path) + " again")
		a.startDownload(it)
	}
}

// syncDownloads: every row's download under way, or tried again (a failed one, or a file the
// cache lost), and every folder in the cache that no row names deleted. At start, and after
// the list is set as text.
func (a *App) syncDownloads() {
	dir := downloadsDir()
	if dir == "" {
		return
	}
	keep := map[string]bool{}
	for _, it := range a.cfg.Queue {
		if it.URL == "" {
			continue
		}
		keep[downloadKey(it.URL)] = true
		if it.Got {
			if _, err := os.Stat(it.Path); err != nil {
				it.Got = false // the cache was cleared by hand: again
			}
		}
		if !it.Cleared {
			a.startDownload(it)
		}
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if !keep[e.Name()] {
			os.RemoveAll(filepath.Join(dir, e.Name()))
		}
	}
}

// removeDownload: the row's gone: so is its folder
func (a *App) removeDownload(it *Item) {
	if it.URL == "" {
		return
	}
	a.stopDownload(it)
	if dir := downloadsDir(); dir != "" {
		os.RemoveAll(filepath.Join(dir, downloadKey(it.URL)))
	}
}

// downloadNote: what the row's length column says while it downloads
func downloadNote(it *Item) string {
	d := it.dl
	switch {
	case d == nil && it.Cleared:
		return "not in the cache"
	case d == nil:
		return "not downloaded"
	case d.ready && d.total > 0:
		return fmt.Sprintf("%s · %d%%", formatTime(it.Duration), d.got*100/d.total)
	case d.ready:
		return fmt.Sprintf("%s · %s", formatTime(it.Duration), formatBytes(d.got))
	case d.total > 0:
		return fmt.Sprintf("%d%% of %s", d.got*100/d.total, formatBytes(d.total))
	case d.got > 0:
		return formatBytes(d.got)
	}
	return "connecting"
}

// ---------- the cache's size ----------

// cacheLimit: the bytes the downloads may take (0: as many as there are)
func (a *App) cacheLimit() int64 { return int64(float64(a.cfg.CacheGB) * (1 << 30)) }

// cacheSize: what the downloads take now, parts included
func cacheSize() int64 {
	var total int64
	filepath.WalkDir(downloadsDir(), func(_ string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			if st, err := d.Info(); err == nil {
				total += st.Size()
			}
		}
		return nil
	})
	return total
}

// CacheText: what's in the cache, for the Clear Download Cache sheet: "3 downloads, 4.2 GB" ("" for none)
func (a *App) CacheText() string {
	text := ""
	a.wait(func() {
		n := 0
		for _, it := range a.cfg.Queue {
			if it.URL != "" && (it.Got || it.dl != nil) {
				n++
			}
		}
		if size := cacheSize(); n > 0 || size > 0 {
			text = fmt.Sprintf("%d download%s, %s", n, map[bool]string{true: "s"}[n != 1], formatBytes(size))
		}
	})
	return text
}

// makeRoom: a download's size just came: refused when bigger than the cache limit, else the
// oldest downloads go until it fits
func (a *App) makeRoom(it *Item, total int64) {
	limit := a.cacheLimit()
	if limit <= 0 {
		return
	}
	if total > limit {
		it.dl.refused = fmt.Sprintf("bigger than the cache limit (%s; cache_gb in Settings)", formatBytes(limit))
		a.log(fmt.Sprintf("%s is %s, bigger than the cache limit of %s (cache_gb in Party > Settings).", filepath.Base(it.Path), formatBytes(total), formatBytes(limit)))
		it.dl.cancel()
		return
	}
	have := int64(0)
	if st, err := os.Stat(it.Path); err == nil {
		have = st.Size()
	}
	a.trimCache(limit - (total - have))
}

// trimCache deletes the oldest downloads (the one playing never) until the cache is within limit bytes
func (a *App) trimCache(limit int64) {
	if a.cacheLimit() <= 0 {
		return
	}
	var kept []*Item
	for _, it := range a.cfg.Queue {
		if it.URL != "" && it.Got && it != a.current {
			kept = append(kept, it)
		}
	}
	modified := func(it *Item) time.Time {
		st, err := os.Stat(it.Path)
		if err != nil {
			return time.Time{}
		}
		return st.ModTime()
	}
	sort.SliceStable(kept, func(i, j int) bool { return modified(kept[i]).Before(modified(kept[j])) })
	for _, it := range kept {
		if cacheSize() <= limit {
			break
		}
		a.clearDownload(it)
		a.log("Cleared " + filepath.Base(it.Path) + " from the cache to make room (cache_gb in Party > Settings).")
	}
	a.save()
}

// clearDownload deletes the item's download, its row staying for a double-click
func (a *App) clearDownload(it *Item) {
	a.stopDownload(it)
	if dir := downloadsDir(); dir != "" {
		os.RemoveAll(filepath.Join(dir, downloadKey(it.URL)))
	}
	it.Got, it.Cleared, it.Note = false, true, ""
}

// ClearCache: Party > Clear Download Cache…: every download deleted (the one playing stays until
// it's done), their rows kept; "" or why not
func (a *App) ClearCache() string {
	result := ""
	a.wait(func() {
		if a.locked {
			result = "The party is sealed: open it first"
			return
		}
		for _, it := range a.cfg.Queue {
			if it.URL == "" || (it == a.current && a.player.Running()) {
				continue
			}
			a.clearDownload(it)
		}
		a.syncDownloads() // strays, and the rows kept out of it
		a.save()
		a.log("The download cache is cleared.")
	})
	return result
}

// touchDownload marks a download as played now: the last to go when the cache is trimmed
func touchDownload(it *Item) {
	if it.URL != "" && it.Got {
		now := time.Now()
		os.Chtimes(it.Path, now, now)
	}
}

// ---------- playing as it comes ----------

// resumeDownloading: the movie playing from a download ran out of file (finished); once there's
// more, it goes on from where it was (resume). Something else begun meanwhile, the list goes on as usual.
func (a *App) resumeDownloading(it *Item) {
	if !a.playing || a.player.Running() || a.phase != "" || a.resume == nil {
		return
	}
	pos := a.cfg.Position
	if pos >= len(a.cfg.Queue) || a.cfg.Queue[pos] != it {
		a.resume = nil
		a.play(-1)
		return
	}
	if d := it.dl; d != nil && !it.Got {
		need := int64(8 << 20) // new bytes worth starting ffmpeg again for: a fiftieth of the file
		if d.total > 0 {
			need = max(64<<10, d.total/50)
		}
		if d.got < a.resume.got+need {
			a.after(2*time.Second, func() { a.resumeDownloading(it) })
			return
		}
	}
	a.log("Going on with " + filepath.Base(it.Path) + " at " + formatTime(a.resume.at) + ".")
	a.play(pos)
}
