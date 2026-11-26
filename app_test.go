package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/wailsapp/wails/v2/pkg/menu"
)

func testApp(t *testing.T) *App {
	t.Helper()
	a := NewApp(standby)
	a.hostSetup = testHosting
	go a.run()
	t.Cleanup(func() {
		for end := time.Now().Add(30 * time.Second); hostStarting(a) && time.Now().Before(end); {
			time.Sleep(50 * time.Millisecond)
		}
		a.shutdown(nil)
	})
	return a
}

func testHosting(h *Host) {
	h.HTTPPort, h.ICEPort, h.MapPorts, h.CleanLeftovers, h.Cloudflared = freePort(), freeICEPort(), false, false, ""
}

func hostStarting(a *App) bool {
	var starting bool
	a.wait(func() { starting = a.hostStarting })
	return starting
}

// The whole app without its window: host on free ports (no router, no tunnel),
// add three short clips and lose the third (greyed out), Play, and watch it count
// down, seek, switch to the second mid-seek, skip the third and stop at the end.
// Needs ffmpeg (with drawtext) and MediaMTX.
func TestPlayThroughTheList(t *testing.T) {
	if findTool("mediamtx") == "" || findTool("ffmpeg") == "" {
		t.Skip("needs mediamtx and ffmpeg")
	}
	tempHome(t) // never the real settings (dataDir)
	dir := t.TempDir()
	var clips []string
	for i, tone := range []int{440, 660, 880} {
		clip := filepath.Join(dir, fmt.Sprintf("clip.%d.mkv", i+1))
		out, err := exec.Command(findTool("ffmpeg"), "-v", "error", "-f", "lavfi", "-i", "testsrc=s=320x240:r=30:d=4",
			"-f", "lavfi", "-i", fmt.Sprintf("sine=f=%d:d=4", tone), "-c:v", "libx264", "-c:a", "libopus", clip).CombinedOutput()
		if err != nil {
			t.Fatal(err, string(out))
		}
		clips = append(clips, clip)
	}

	a := testApp(t)
	go a.watchFiles()
	a.wait(func() { a.cfg.Countdown = 1 })
	until := func(what string, seconds int, ok func(View) bool) View {
		t.Helper()
		for end := time.Now().Add(time.Duration(seconds) * time.Second); time.Now().Before(end); time.Sleep(100 * time.Millisecond) {
			if v := a.GetView(); ok(v) {
				return v
			}
		}
		t.Fatalf("never: %s (%+v)", what, a.GetView())
		return View{}
	}
	var state func() string
	state = func() (s string) { a.wait(func() { s = a.state() }); return }

	if v := a.GetView(); v.PlayOn || v.LinkPress || len(v.Rows) != 0 {
		t.Fatalf("empty, yet %+v", v)
	}
	a.AddPaths(clips, -1, -1)
	until("making the link", 10, func(v View) bool { return v.Link == "spinner" && len(v.Rows) == 3 && !v.PlayOn })
	v := until("link ready", 20, func(v View) bool { return v.LinkPress && v.PlayOn })
	if v.LinkNote != lanNote || v.Rows[0].Title != "Clip 1" || v.Rows[0].Length != "0:00:04" {
		t.Fatalf("%+v", v)
	}

	os.Remove(clips[2]) // a drive unplugged
	until("the lost one greyed out", 10, func(v View) bool { return v.Rows[2].Off && !v.Rows[0].Off })

	a.PlayClicked()
	until("Stop, counting down", 5, func(v View) bool { return v.Play == "stop" && v.Rows[0].Now && !v.Slider.On })
	until("the first clip, seekable", 10, func(View) bool { return state() == "movie" })
	if log := a.LogText(); strings.Contains(log, "The countdown exited with code") {
		t.Errorf("the countdown card failed:\n%s", log)
	}
	until("the playhead moving", 5, func(v View) bool { return v.Slider.On && v.Slider.Max > 3.9 && v.Slider.Value > 0.3 })
	a.Seek(2.5)
	until("back from the seek", 10, func(v View) bool { return state() == "movie" && v.Slider.Value >= 2.5 })
	a.Seek(1)
	a.PlayRow(1) // double-clicked while the seek is under way
	until("switched to the second", 15, func(v View) bool { return v.Rows[1].Now && v.Rows[0].Played })
	a.PlayRow(2) // greyed out: nothing
	v = until("the end of the list, the lost one skipped", 20, func(v View) bool { return v.Play == "play" && v.PlayOn })
	if !v.Rows[0].Played || !v.Rows[1].Played || !v.Rows[2].Played {
		t.Fatalf("%+v", v)
	}

	a.wait(func() { a.cfg.Queue[0].Paused = 2 }) // stopped there once: on from there
	if v := a.GetView(); v.Rows[0].Length != "0:00:02 of 0:00:04" {
		t.Errorf("a row stopped partway says %q", v.Rows[0].Length)
	}
	a.PlayClicked() // from the top again (the first played on), then Stop
	until("playing again", 10, func(v View) bool { return v.Play == "stop" && v.Rows[0].Now })
	if !strings.Contains(a.LogText(), "Playing on from 0:00:02") {
		t.Error("a video stopped partway didn't play on from there")
	}
	a.PlayClicked()
	until("stopped", 15, func(v View) bool { return v.Play == "play" && v.PlayOn && state() == "ready" })
}

// Stop, a quit or another row keeps a video's place; played through, or barely started, it's from the top
func TestKeepPlace(t *testing.T) {
	tempHome(t) // never the real party file
	movie := &Item{Path: filepath.Join(t.TempDir(), "Movie.mkv"), Kind: "video", Duration: 3600}
	a := NewApp(standby)
	go a.run()
	at := func(seconds float64) float64 {
		var got float64
		a.wait(func() {
			a.cfg.Queue, a.current, a.phase = []*Item{movie}, movie, "movie"
			a.moviePos = &moviePos{seconds, time.Now()}
			a.keepPlace()
			a.phase, a.current = "", nil
			got = movie.Paused
		})
		return got
	}
	if got := at(600); got < 600 || got > 601 {
		t.Errorf("stopped at 10 minutes, kept %v", got)
	}
	if got := at(5); got != 0 {
		t.Errorf("stopped 5 seconds in, kept %v", got)
	}
	if got := at(3570); got != 0 {
		t.Errorf("stopped in the last minute, kept %v", got)
	}
	song := &Item{Path: "Song.m4a", Kind: "audio", Duration: 600}
	a.wait(func() {
		a.current, a.phase, a.moviePos = song, "movie", &moviePos{120, time.Now()}
		a.keepPlace()
		a.phase, a.current = "", nil
	})
	if song.Paused != 0 {
		t.Error("a song kept its place")
	}

	// quitting mid-movie keeps it in the party file
	a.wait(func() {
		a.cfg.Queue, a.current, a.phase = []*Item{movie}, movie, "movie"
		a.moviePos = &moviePos{1234, time.Now()}
	})
	a.shutdown(nil)
	b := NewApp(standby)
	go b.run()
	defer b.shutdown(nil)
	b.wait(func() {
		if len(b.cfg.Queue) != 1 || b.cfg.Queue[0].Paused < 1234 || b.cfg.Queue[0].Paused > 1235 {
			t.Errorf("after a quit: %+v", b.cfg.Queue)
		}
	})
}

func TestDroppedFolderLeavesHiddenOut(t *testing.T) {
	tempHome(t)
	dir := filepath.Join(t.TempDir(), "Week 3")
	for _, f := range []string{"a.md", ".c.md", ".hidden/b.md", "sub/d.md", "sub/.Trashes/e.md"} {
		p := filepath.Join(dir, filepath.FromSlash(f))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	a := testApp(t)
	a.addPaths([]string{dir}, -1, -1)
	a.addPaths([]string{filepath.Join(dir, ".hidden")}, -1, -1)
	var got []string
	a.wait(func() {
		for _, it := range a.cfg.Queue {
			rel, _ := filepath.Rel(dir, it.Path)
			got = append(got, filepath.ToSlash(rel))
		}
	})
	if strings.Join(got, " ") != "a.md sub/d.md .hidden/b.md" {
		t.Fatal(got)
	}
}

func TestLinkForgottenWhileItIsMade(t *testing.T) {
	tempHome(t)
	a := testApp(t)
	a.forgetLink(context.Background(), a.hostLinks())
	if !a.linkForgotten.Load() {
		t.Fatal("a quit before the link was made left shutdown to read the clipboard, after the window has gone")
	}
}

func TestSessionEndSavesAndPutsNothingIn(t *testing.T) {
	tempHome(t)
	a := testApp(t)
	staged := filepath.Join(t.TempDir(), "MouseParty-next")
	if err := os.WriteFile(staged, []byte("next"), 0o755); err != nil {
		t.Fatal(err)
	}
	a.wait(func() {
		a.cfg.Welcomed = true
		a.update.state, a.update.staged, a.update.latest, a.update.restart = "ready", staged, "9.9.9", true
	})
	a.quitAtSessionEnd(nil)
	p, _ := openTheParty(func(string) {})
	welcomed := loadConfig(p).Welcomed
	p.close()
	if !welcomed {
		t.Error("the session ended before what the app holds was saved")
	}
	var state string
	a.wait(func() { state = a.update.state })
	if log := a.LogText(); state != "ready" || strings.Contains(log, "9.9.9") || strings.Contains(log, "update in") {
		t.Errorf("the update was put in as the session ended, where it would be cut off halfway (state %q):\n%s", state, log)
	}
	if _, err := os.Stat(staged); err != nil {
		t.Error("the staged update is gone:", err)
	}
}

func TestSessionEndLetsGoInTime(t *testing.T) {
	tempHome(t)
	a := testApp(t)
	release := make(chan struct{})
	defer close(release)
	a.do(func() { <-release })
	ended := make(chan time.Duration, 1)
	began := time.Now()
	go func() {
		a.quitAtSessionEnd(nil)
		ended <- time.Since(began)
	}()
	select {
	case took := <-ended:
		if took < sessionGrace {
			t.Errorf("with its work stuck, the session's end let go after %v, without waiting %v for it", took.Round(time.Millisecond), sessionGrace)
		}
	case <-time.After(3 * sessionGrace):
		t.Errorf("with its work stuck, the session's end didn't let go after %v", 3*sessionGrace)
	}
}

func TestNoUpdateCheckWhileLocked(t *testing.T) {
	tempHome(t)
	a := testApp(t)
	click := func() (state, note string) {
		t.Helper()
		var m *menu.Menu
		a.wait(func() { m = a.menu() })
		var check *menu.MenuItem
		for _, top := range m.Items {
			if top.SubMenu == nil {
				continue
			}
			for _, it := range top.SubMenu.Items {
				if strings.HasPrefix(strings.ReplaceAll(it.Label, "&", ""), "Check for Updates") {
					check = it
				}
			}
		}
		if check == nil {
			t.Fatal("no Check for Updates… in the menus")
		}
		if !check.Disabled {
			check.Click(&menu.CallbackData{MenuItem: check})
		}
		a.wait(func() {})
		a.wait(func() { state, note = a.update.state, a.update.note })
		return state, note
	}
	a.wait(func() { a.locked = true })
	if state, note := click(); state != "" {
		t.Fatalf("Check for Updates… looked for one while the party was locked (%q: %s)", state, note)
	}
	a.wait(func() { a.locked = false })
	if state, _ := click(); state == "" {
		t.Fatal("Check for Updates… didn't look for one once the party was open")
	}
}

func TestLogKeptOffAPipe(t *testing.T) {
	if runtime.GOOS == "darwin" {
		t.Skip("macOS sends Finder's apps' stderr nowhere, so the log always goes there")
	}
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	was := os.Stderr
	os.Stderr = w
	defer func() {
		os.Stderr = was
		r.Close()
		w.Close()
	}()
	if stderrForLog() {
		t.Fatal("a pipe on stderr was taken for a terminal")
	}
}
