package main

import (
	"encoding/json"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

const mkvDescription = `Input #0, matroska,webm, from 'm.mkv':
  Metadata:
    title           : Brazil
    ENCODER         : Lavf63.1.102
  Chapters:
    Chapter #0:0: start 0.000000, end 1.000000
      Metadata:
        title           : Opening
  Duration: 01:02:03.50, start: 0.000000, bitrate: 190 kb/s
  Stream #0:0: Video: h264 (High 4:4:4 Predictive), yuv444p(tv, progressive), 320x240 [SAR 1:1 DAR 4:3], 25 fps, 25 tbr, 1k tbn
    Metadata:
      ENCODER         : Lavc63.1.102 libx264
  Stream #0:1(fre): Audio: aac (LC), 44100 Hz, mono, fltp (default)
  Stream #0:2[0x3](eng): Audio: ac3, 48000 Hz, 5.1(side), fltp, 448 kb/s
  Stream #0:3(eng): Subtitle: subrip (srt) (default) (forced)
    Metadata:
      title           : English SDH
  Stream #0:4(ger): Subtitle: hdmv_pgs_subtitle (pgssub), 1920x1080
At least one output file must be specified
`

const mp3Description = `Input #0, mp3, from 'song.mp3':
  Metadata:
    title           : So What
    ARTIST          : Miles Davis
  Duration: 00:00:03.00, start: 0.025056, bitrate: 91 kb/s
  Stream #0:0: Audio: mp3 (mp3float), 44100 Hz, mono, fltp, 64 kb/s, start 0.025057
  Stream #0:1: Video: png, rgb24(pc, gbr/unknown/unknown), 600x600 [SAR 1:1 DAR 1:1], 90k tbr, 90k tbn, start 0.025056 (attached pic)
    Metadata:
      comment         : Other
At least one output file must be specified
`

func TestInspectReadsFFmpegsDescription(t *testing.T) {
	m := parseInspect(mkvDescription)
	want := MediaInfo{Duration: 3723.5, Title: "Brazil", Streams: []StreamInfo{
		{Kind: "Video", Codec: "h264"},
		{Kind: "Audio", Codec: "aac", Lang: "fre", Default: true},
		{Kind: "Audio", Codec: "ac3", Lang: "eng"},
		{Kind: "Subtitle", Codec: "subrip", Lang: "eng", Title: "English SDH", Default: true, Forced: true},
		{Kind: "Subtitle", Codec: "hdmv_pgs_subtitle", Lang: "ger"},
	}}
	if !reflect.DeepEqual(m, want) {
		t.Fatalf("%+v", m)
	}
	song := parseInspect(mp3Description)
	if song.Title != "So What" || song.Artist != "Miles Davis" || len(song.of("Video")) != 1 || !song.of("Video")[0].Cover {
		t.Fatalf("%+v", song)
	}
	gone := parseInspect("[in#0 @ 0x140f07fa0] Error opening input: No such file or directory\nError opening input file /x.mkv.\nError opening input files: No such file or directory\n")
	if gone.Error != "Error opening input files: No such file or directory" {
		t.Fatalf("%+v", gone)
	}
}

// What ffmpeg says agrees with ffprobe, on a file with languages, flags, titles and cover art
func TestInspectAgreesWithFFprobe(t *testing.T) {
	ffprobe := findTool("ffprobe")
	if ffprobe == "" || findTool("ffmpeg") == "" {
		t.Skip("needs ffmpeg and ffprobe")
	}
	dir := t.TempDir()
	srt := filepath.Join(dir, "s.srt")
	exec.Command("sh", "-c", `printf '1\n00:00:01,000 --> 00:00:02,000\nHi\n' > `+srt).Run()
	movie := filepath.Join(dir, "m.mkv")
	out, err := exec.Command(findTool("ffmpeg"), "-v", "error", "-f", "lavfi", "-i", "testsrc=s=320x240:d=2", "-f", "lavfi", "-i", "sine=d=2",
		"-f", "lavfi", "-i", "sine=f=600:d=2", "-i", srt, "-f", "lavfi", "-i", "color=c=red:s=64x64:d=0.04",
		"-map", "0", "-map", "1", "-map", "2", "-map", "3", "-map", "4", "-c:v:0", "libx264", "-c:v:1", "png", "-c:a", "libopus", "-c:s", "webvtt",
		"-metadata", "title=Brazil", "-metadata", "artist=Gilliam", "-metadata:s:a:0", "language=fre", "-metadata:s:a:1", "language=eng",
		"-disposition:a:0", "default", "-disposition:a:1", "0", "-metadata:s:s:0", "language=eng",
		"-metadata:s:s:0", "title=English SDH", "-disposition:s:0", "forced", "-disposition:v:1", "attached_pic", movie).CombinedOutput()
	if err != nil {
		t.Skip("this ffmpeg can't make the test file: ", strings.TrimSpace(string(out)))
	}
	song := filepath.Join(dir, "song.mp4") // a cover's flag survives in MP4, not in Matroska
	if out, err := exec.Command(findTool("ffmpeg"), "-v", "error", "-f", "lavfi", "-i", "sine=d=2", "-f", "lavfi", "-i",
		"color=c=red:s=64x64:d=0.04", "-map", "0", "-map", "1", "-c:a", "libopus", "-c:v", "png", "-disposition:v", "attached_pic",
		"-metadata", "title=So What", "-metadata", "artist=Miles Davis", song).CombinedOutput(); err != nil {
		t.Fatal(string(out))
	}
	for _, f := range []string{movie, song} {
		agree(t, ffprobe, f)
	}
	if !inspect(song).of("Video")[0].Cover {
		t.Fatal("the cover wasn't seen")
	}
}

func agree(t *testing.T, ffprobe, file string) {
	t.Helper()
	b, err := exec.Command(ffprobe, "-v", "error", "-show_entries",
		"format=duration:format_tags=title,artist:stream=codec_type,codec_name:stream_tags=language,title:stream_disposition=default,forced,attached_pic",
		"-of", "json", file).Output()
	if err != nil {
		t.Fatal(err)
	}
	var p struct {
		Format struct {
			Tags map[string]string `json:"tags"`
		} `json:"format"`
		Streams []struct {
			CodecType   string            `json:"codec_type"`
			CodecName   string            `json:"codec_name"`
			Tags        map[string]string `json:"tags"`
			Disposition map[string]int    `json:"disposition"`
		} `json:"streams"`
	}
	json.Unmarshal(b, &p)
	tags := map[string]string{}
	for k, v := range p.Format.Tags { // Matroska's are in capitals
		tags[strings.ToLower(k)] = v
	}
	m := inspect(file)
	if m.Title != tags["title"] || m.Artist != tags["artist"] || len(m.Streams) != len(p.Streams) || m.Duration < 1.9 {
		t.Fatalf("%s: ffmpeg %+v\nffprobe %s", file, m, b)
	}
	for i, s := range p.Streams {
		got := m.Streams[i]
		if !strings.EqualFold(got.Kind, s.CodecType) || got.Codec != s.CodecName || got.Lang != s.Tags["language"] ||
			got.Title != s.Tags["title"] || got.Default != (s.Disposition["default"] == 1) ||
			got.Forced != (s.Disposition["forced"] == 1) || got.Cover != (s.Disposition["attached_pic"] == 1) {
			t.Errorf("%s stream %d: ffmpeg says %+v, ffprobe %+v", filepath.Base(file), i, got, s)
		}
	}
}
