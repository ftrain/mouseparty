package main

import (
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"testing"
)

// A movie's sound moved (Item.Sound, soundShift) falls where it was moved to, from
// the start and after a seek: a clip silent for 3 seconds, then a tone, played
// through movieCommand's own arguments (written to a file instead of MediaMTX,
// and not in real time), and heard for where the tone begins.
func TestSoundShift(t *testing.T) {
	ffmpeg := findTool("ffmpeg")
	if ffmpeg == "" {
		t.Skip("needs ffmpeg")
	}
	clip := filepath.Join(t.TempDir(), "clip.mkv")
	if out, err := exec.Command(ffmpeg, "-v", "error", "-f", "lavfi", "-i", "testsrc=s=320x240:r=30:d=6",
		"-f", "lavfi", "-i", "sine=f=1000:d=3", "-af", "adelay=delays=3000:all=1",
		"-c:v", "libx264", "-c:a", "libopus", "-t", "6", clip).CombinedOutput(); err != nil {
		t.Fatalf("making the clip: %v: %s", err, out)
	}
	opts := StreamOpts{URL: "rtsp://127.0.0.1:1/live", Bitrate: "800k", Preset: "ultrafast"}
	for _, c := range []struct{ start, shift float64 }{{0, 0}, {0, 0.5}, {0, -0.5}, {1, 0.75}, {1, -1.25}} {
		args, _ := movieCommand(clip, c.start, 6, 0, c.shift, Burn{TextTrack: -1, ImageTrack: -1}, opts)
		args = args[:len(args)-len(encodingArgs(opts))]
		args = slices.DeleteFunc(args, func(a string) bool { return a == "-re" })
		heard := filepath.Join(t.TempDir(), "heard.raw")
		args = append(append([]string{"-v", "error"}, args...), "-vn", "-c:a", "pcm_s16le", "-ac", "1", "-ar", "8000", "-f", "s16le", heard)
		if out, err := exec.Command(ffmpeg, args...).CombinedOutput(); err != nil {
			t.Fatalf("%+v: %v: %s", c, err, out)
		}
		onset := toneAt(t, heard, 8000)
		if want := 3 - c.start + c.shift; math.Abs(onset-want) > 0.05 {
			t.Errorf("started %gs in, moved %+gs: the tone came at %.3fs, not %.3fs", c.start, c.shift, onset, want)
		}
	}
	if soundShift(0.0004) != "" || soundShift(0) != "" {
		t.Error("no shift should be no filter")
	}
}

// toneAt: seconds into raw mono 16-bit sound where it first gets loud
func toneAt(t *testing.T, path string, rate int) float64 {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i+1 < len(b); i += 2 {
		if v := int16(uint16(b[i]) | uint16(b[i+1])<<8); v > 2000 || v < -2000 {
			return float64(i/2) / float64(rate)
		}
	}
	t.Fatalf("no tone in %d bytes", len(b))
	return 0
}
