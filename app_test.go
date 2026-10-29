package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// The whole app without its window: host on free ports (no router, no tunnel),
// add three short clips and lose the third (greyed out), Play, and watch it count
// down, seek, switch to the second mid-seek, skip the third and stop at the end.
// Needs ffmpeg (with drawtext) and MediaMTX.
func TestPlayThroughTheList(t *testing.T) {
	if findTool("mediamtx") == "" || findTool("ffmpeg") == "" {
		t.Skip("needs mediamtx and ffmpeg")
	}
	t.Setenv("HOME", t.TempDir()) // never the real ~/.openhouseparty.json
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
	a.AddPaths(clips, -1)
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

	a.PlayClicked() // from the top again, then Stop
	until("playing again", 10, func(v View) bool { return v.Play == "stop" && v.Rows[0].Now })
	a.PlayClicked()
	until("stopped", 15, func(v View) bool { return v.Play == "play" && v.PlayOn && state() == "ready" })
}
