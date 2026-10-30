package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// OPENHOUSEPARTY_PREVIEW=<dir with cover.png> SONG=<a song> FF=<ffmpeg> go test -run TestPreviewAudioCard:
// <dir>/clip.mp4, ten seconds of what viewers see while it plays
func TestPreviewAudioCard(t *testing.T) {
	dir := os.Getenv("OPENHOUSEPARTY_PREVIEW")
	if dir == "" {
		t.Skip()
	}
	graph, files := audioCard(SoundInfo{Title: "So What", Artist: "Miles Davis"}, "song", 2, "0:a:0", nil)
	defer removeAll(files)
	out, err := exec.Command(os.Getenv("FF"), "-v", "error", "-y", "-ss", "40", "-t", "10", "-i", os.Getenv("SONG"),
		"-f", "lavfi", "-i", "color=c=black:s=1280x720:r=30", "-loop", "1", "-framerate", "30", "-i", filepath.Join(dir, "cover.png"),
		"-filter_complex", graph+"[v]", "-map", "[v]", "-map", "[a]", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p",
		"-c:a", "aac", filepath.Join(dir, "clip.mp4")).CombinedOutput()
	if err != nil {
		t.Fatal(err, string(out))
	}
}
