package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Every test's HOME is its own data folder (dataDir): on Linux, XDG_CONFIG_HOME
// (set on GitHub's runners) would put them all in one, each seeing the others' lists
func TestMain(m *testing.M) {
	os.Unsetenv("XDG_CONFIG_HOME")
	if len(os.Args) > 1 && os.Args[1] == siteArg { // the viewer site of a host under test, in its sandbox (site.go)
		os.Exit(siteMain())
	}
	os.Exit(m.Run())
}

// The whole app without its window: host on free ports (no router, no tunnel),
// add three short clips and lose the third (greyed out), Play, and watch it count
// down, seek, switch to the second mid-seek, skip the third and stop at the end.
// Needs ffmpeg (with drawtext) and MediaMTX.
func TestPlayThroughTheList(t *testing.T) {
	if findTool("mediamtx") == "" || findTool("ffmpeg") == "" {
		t.Skip("needs mediamtx and ffmpeg")
	}
	t.Setenv("HOME", t.TempDir()) // never the real settings (dataDir)
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

	a := NewApp(standby)
	a.hostSetup = func(h *Host) {
		h.HTTPPort, h.ICEPort, h.MapPorts, h.CleanLeftovers, h.Cloudflared = freePort(), freeICEPort(), false, false, ""
	}
	go a.run()
	go a.watchFiles()
	defer a.shutdown(nil)
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
	if v.LinkNote != "Wi-Fi only" || v.Rows[0].Title != "Clip 1" || v.Rows[0].Length != "0:00:04" {
		t.Fatalf("%+v", v)
	}

	os.Remove(clips[2]) // a drive unplugged
	until("the lost one greyed out", 10, func(v View) bool { return v.Rows[2].Off && !v.Rows[0].Off })

	a.PlayClicked()
	until("Stop, counting down", 5, func(v View) bool { return v.Play == "stop" && v.Rows[0].Now && !v.Slider.On })
	until("the first clip, seekable", 10, func(View) bool { return state() == "movie" })
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
	t.Setenv("HOME", t.TempDir()) // never the real party file
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
