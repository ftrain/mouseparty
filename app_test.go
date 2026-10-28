package main

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// The whole app without its window: host on free ports (no router, no tunnel),
// add two short clips, Play, and watch it count down, play both, seek, and stop
// at the end; the first brings graffiti, for as long as it plays. Needs ffmpeg
// (with drawtext) and MediaMTX.
func TestPlayThroughTheList(t *testing.T) {
	if findTool("mediamtx") == "" || findTool("ffmpeg") == "" {
		t.Skip("needs mediamtx and ffmpeg")
	}
	t.Setenv("HOME", t.TempDir()) // never the real ~/.tubeyap.json
	dir := t.TempDir()
	var clips []string
	for i, tone := range []int{440, 660} {
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
	until("making the link", 10, func(v View) bool { return v.Link == "spinner" && len(v.Rows) == 2 && !v.PlayOn })
	v := until("link ready", 20, func(v View) bool { return v.LinkPress && v.PlayOn })
	if v.LinkNote != "Wi-Fi only" || v.Rows[0].Title != "Clip 1" || v.Rows[0].Length != "0:00:04" {
		t.Fatalf("%+v", v)
	}

	a.SetRowApp(0, "graffiti")
	if v := a.GetView(); v.Rows[0].App != "graffiti" || v.Rows[1].App != "" {
		t.Fatalf("%+v", v.Rows)
	}
	app := func() (name any) {
		a.wait(func() { name = a.host.apps.hello()["app"] })
		if name != nil {
			name = name.(map[string]any)["name"]
		}
		return
	}

	a.PlayClicked()
	until("Stop, counting down", 5, func(v View) bool { return v.Play == "stop" && v.Rows[0].Now && !v.Slider.On })
	until("the first clip, seekable", 10, func(View) bool { return state() == "movie" })
	until("the playhead moving", 5, func(v View) bool { return v.Slider.On && v.Slider.Max > 3.9 && v.Slider.Value > 0.3 })
	a.Seek(2.5)
	if app() != "graffiti" {
		t.Fatal("no graffiti with the first clip")
	}
	until("back from the seek", 10, func(v View) bool { return state() == "movie" && v.Slider.Value >= 2.5 })
	if app() != "graffiti" {
		t.Fatal("the seek stopped the graffiti")
	}
	until("on to the second", 15, func(v View) bool { return v.Rows[1].Now && v.Rows[0].Played })
	if app() != nil {
		t.Fatal("graffiti outlasted its clip")
	}
	v = until("the end of the list", 20, func(v View) bool { return v.Play == "play" && v.PlayOn })
	if !v.Rows[0].Played || !v.Rows[1].Played {
		t.Fatalf("%+v", v)
	}

	a.PlayClicked() // from the top again, then Stop
	until("playing again", 10, func(v View) bool { return v.Play == "stop" && v.Rows[0].Now })
	a.PlayClicked()
	until("stopped", 15, func(v View) bool { return v.Play == "play" && v.PlayOn && state() == "ready" })
}
