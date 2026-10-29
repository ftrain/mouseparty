package main

// The streamer: ffmpeg sends a movie (or an "up next" card) to the app's own
// MediaMTX over RTSP, as H264 and Opus at one fixed size, so movies and cards
// join into one continuous stream for viewers. Burns in subtitles on request.

import (
	"bufio"
	"fmt"
	"net"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"
)

const (
	canvasW, canvasH = 1280, 720 // every file is fitted into this, letterboxed, so the server can join them
	cardFont         = "/System/Library/Fonts/Menlo.ttc"
	green            = "0x00ff00" // host_web/host.css
)

// StreamOpts: where the stream goes and how it's encoded
type StreamOpts struct {
	URL, Bitrate, Preset string
}

// encodingArgs: what every publish sends: H264 with 1s keyframes and stereo 48kHz
// Opus (the only audio browsers' WebRTC plays), over RTSP. Movies and cards must
// match exactly, and match media/standby_opus.mp4, for MediaMTX to join them.
func encodingArgs(o StreamOpts) []string {
	value, _ := strconv.Atoi(regexp.MustCompile(`[^0-9]`).ReplaceAllString(o.Bitrate, ""))
	unit := "m"
	if strings.Contains(strings.ToLower(o.Bitrate), "k") {
		unit = "k"
	}
	return []string{
		"-c:v", "libx264", "-preset", o.Preset, "-pix_fmt", "yuv420p", "-profile:v", "main", "-level", "3.1",
		"-bf", "0", // no B-frames: lower latency, and what WebRTC players expect
		"-r", "30", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", // a keyframe every second
		"-b:v", o.Bitrate,
		"-maxrate", fmt.Sprintf("%d%s", value*12/10, unit),
		"-bufsize", fmt.Sprintf("%d%s", value*2, unit),
		"-c:a", "libopus", "-b:a", "128k", "-ac", "2", "-ar", "48000",
		"-f", "rtsp", "-rtsp_transport", "tcp", o.URL,
	}
}

// textFile: text for drawtext goes through a file, so no character in it can break
// the filter syntax (and expansion=none stops drawtext reading %{...} in it)
func textFile(text string) string {
	f, err := os.CreateTemp("", "openhouseparty-*.txt")
	if err != nil {
		return ""
	}
	f.WriteString(text)
	f.Close()
	return f.Name()
}

// fitText: shortened to room characters, and a Menlo size that fits it across 90%
// of width (Menlo's advance is 0.6em)
func fitText(text string, width float64, most, least, room int) (string, int) {
	if utf8.RuneCountInString(text) > room {
		text = string([]rune(text)[:room-1]) + "…"
	}
	n := max(utf8.RuneCountInString(text), 1)
	return text, max(least, min(most, int(width*0.9/(0.6*float64(n)))))
}

// CardLine is one line of a card: drawn centred at y. Literal text may hold
// drawtext expressions, so only text from here is literal; the rest goes through textFile.
type CardLine struct {
	Text, Colour string
	Size         int
	Y            string
	Literal      bool
}

// cardCommand: ffmpeg arguments for a card on black with silence, for seconds (0: until stopped)
func cardCommand(lines []CardLine, seconds int, o StreamOpts) (args, temps []string) {
	var filters []string
	for _, l := range lines {
		source := fmt.Sprintf("text='%s'", l.Text)
		if !l.Literal {
			f := textFile(l.Text)
			temps = append(temps, f)
			source = fmt.Sprintf("textfile='%s':expansion=none", f)
		}
		filters = append(filters, fmt.Sprintf("drawtext=fontfile=%s:%s:fontcolor=%s:fontsize=%d:x=(w-tw)/2:y=%s",
			cardFont, source, l.Colour, l.Size, l.Y))
	}
	length := ""
	if seconds > 0 {
		length = fmt.Sprintf(":d=%d", seconds)
	}
	args = []string{"-re", "-f", "lavfi", "-i", fmt.Sprintf("color=c=black:s=%dx%d:r=30%s", canvasW, canvasH, length),
		"-re", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"}
	if seconds > 0 {
		args = append(args, "-t", strconv.Itoa(seconds))
	}
	args = append(args, "-vf", strings.Join(filters, ","))
	return append(args, encodingArgs(o)...), temps
}

// countdownCommand: an "up next" card counting down from seconds
func countdownCommand(seconds int, title string, o StreamOpts) ([]string, []string) {
	title, size := fitText(title, canvasW, 72, 32, 48)
	return cardCommand([]CardLine{
		{"> up next", green, 40, "h/2-190", true},
		{title, "white", size, "h/2-110", false},
		{fmt.Sprintf(`%%{eif\:max(1\,ceil(%d-t))\:d}`, seconds), green, 200, "h/2+10", true},
	}, seconds, o)
}

// documentCommand: while a PDF is up, viewers' pages show the document itself over
// the video; the stream carries this card (and silence) until the app moves on
func documentCommand(title string, o StreamOpts) ([]string, []string) {
	title, size := fitText(title, canvasW, 64, 32, 48)
	return cardCommand([]CardLine{
		{"> reading together", green, 40, "h/2-120", true},
		{title, "white", size, "h/2-40", false},
		{"the pages are on the Open House Party page", "0x8e8e93", 28, "h/2+80", true},
	}, 0, o)
}

// burnTextSubtitles: the subtitles filter times by each frame's timestamp, which
// starts at 0 after a seek. Shift frames to movie time for it (minus any offset),
// then back, so the subtitles land where they belong when starting part-way in.
func burnTextSubtitles(filter string, shift float64) []string {
	if shift == 0 {
		return []string{filter}
	}
	return []string{fmt.Sprintf("setpts=PTS+%.3f/TB", shift), filter, "setpts=PTS-STARTPTS"}
}

var srtTiming = regexp.MustCompile(`(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})`)

// offsetSRT: a temporary copy of an SRT file with every time moved by offset seconds
func offsetSRT(path string, offset float64) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	stamp := func(ms int) string {
		ms = max(ms, 0)
		return fmt.Sprintf("%02d:%02d:%02d,%03d", ms/3600000, ms/60000%60, ms/1000%60, ms%1000)
	}
	shift := int(offset * 1000)
	out := srtTiming.ReplaceAllStringFunc(string(b), func(s string) string {
		m := srtTiming.FindStringSubmatch(s)
		n := make([]int, 8)
		for i := range n {
			n[i], _ = strconv.Atoi(m[i+1])
		}
		start := ((n[0]*3600+n[1]*60+n[2])*1000 + n[3]) + shift
		end := ((n[4]*3600+n[5]*60+n[6])*1000 + n[7]) + shift
		return stamp(start) + " --> " + stamp(end)
	})
	f, err := os.CreateTemp("", "openhouseparty-*.srt")
	if err != nil {
		return "", err
	}
	defer f.Close()
	_, err = f.WriteString(out)
	return f.Name(), err
}

// SoundInfo: for a file with sound and no moving picture (music, a podcast):
// whether it has a video track, which one is its cover art, and its tags
type SoundInfo struct {
	Video         bool
	Cover         int // -1: none
	Title, Artist string
}

func soundInfo(path string) SoundInfo {
	m := inspect(path)
	if m.Error != "" {
		return SoundInfo{Video: true, Cover: -1}
	}
	info := SoundInfo{Cover: -1, Title: m.Title, Artist: m.Artist}
	for n, s := range m.of("Video") {
		if !s.Cover {
			info.Video = true
		} else if info.Cover < 0 {
			info.Cover = n
		}
	}
	return info
}

// extractCover: the cover art, as a PNG file to loop under the sound, or ""
func extractCover(path string, index int) string {
	f, err := os.CreateTemp("", "openhouseparty-*.png")
	if err != nil {
		return ""
	}
	f.Close()
	ctx, cancel := contextTimeout(30 * time.Second)
	defer cancel()
	err = exec.CommandContext(ctx, firstTool("ffmpeg"), "-v", "error", "-y", "-i", path, "-map",
		fmt.Sprintf("0:v:%d", index), "-frames:v", "1", f.Name()).Run()
	if st, e := os.Stat(f.Name()); err == nil && e == nil && st.Size() > 0 {
		return f.Name()
	}
	os.Remove(f.Name())
	return ""
}

// The sound drawn as it plays, gently: a constant-Q spectrum (notes spaced like
// a piano's keys, deep bass and the top left out) worked out tiny, blurred, and
// left to fade slowly (lagfun), so each note swells into a soft glow and dies
// away over a couple of seconds. It stands on a horizon across the middle with
// a dimmer, slower reflection under it, then is scaled up and blurred again. In
// a muted green (cscheme: red, green, blue for the left channel, then the right).
const (
	spectrumColours = "0.06|0.5|0.3|0.06|0.42|0.4"
	spectrum        = "showcqt=s=128x36:fps=30:bar_h=36:sono_h=0:axis=0:basefreq=80:endfreq=6000:bar_v=7:bar_g=1.5:attack=0.7:cscheme=" + spectrumColours
)

// spectrumGraph: the sound at [in] drawn at w x h into [out]
func spectrumGraph(in, out string, w, h int) string {
	return fmt.Sprintf("[%s]%s,format=rgb24,gblur=sigma=1.6,lagfun=decay=0.975,split[up][down];"+
		"[down]vflip,lagfun=decay=0.985,colorchannelmixer=rr=0.45:gg=0.45:bb=0.45,gblur=sigma=2.5[reflection];"+
		"[up][reflection]vstack,scale=%d:%d:flags=bicubic,gblur=sigma=10[%s]", in, spectrum, w, h, out)
}

// audioCard: the filter graph making the picture for a sound file, on black
// (input 1): its sound as a moving spectrum filling the frame, and over it its
// title and artist, beside its cover art (input coverInput, or -1 for none). The
// sound (soundIn, through soundFilters) comes out at [a]. Returns the graph,
// ending in the picture's pad, and the text files to delete after.
func audioCard(info SoundInfo, name string, coverInput int, soundIn string, soundFilters []string) (string, []string) {
	w, h := canvasW, canvasH
	margin := w * 3 / 32 // 120 of 1280
	var side, textX, room, titleY int
	if coverInput >= 0 { // cover and words side by side, in the middle
		side = h * 5 / 12 / 2 * 2 // 300 of 720
		textX = margin + side + w/32
		room = w - margin - textX
		titleY = (h-side)/2 + side/3
	} else {
		textX, room = -1, w-2*margin
		titleY = h/2 - h/9
	}
	titleText := info.Title
	if titleText == "" {
		titleText = name
	}
	title, titleSize := fitText(titleText, float64(room)/0.9, 56, 28, 60)
	artist, artistSize := fitText(info.Artist, float64(room)/0.9, 36, 24, 70)
	files := []string{textFile(title)}
	if artist != "" {
		files = append(files, textFile(artist))
	}
	x := "(w-tw)/2"
	if textX >= 0 {
		x = strconv.Itoa(textX)
	}
	filters := strings.Join(append(append([]string{}, soundFilters...), "asplit[a][heard]"), ",")
	graph := fmt.Sprintf("[%s]%s;%s;[1:v][spectrum]overlay=0:0", soundIn, filters, spectrumGraph("heard", "spectrum", w, h))
	if coverInput >= 0 {
		graph = fmt.Sprintf("[%d:v]scale=%d:%d:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1[cover];",
			coverInput, side, side) + graph + fmt.Sprintf("[card];[card][cover]overlay=%d:%d", margin, (h-side)/2)
	}
	graph += fmt.Sprintf(",drawtext=fontfile=%s:textfile='%s':expansion=none:fontcolor=white:fontsize=%d:x=%s:y=%d",
		cardFont, files[0], titleSize, x, titleY)
	if artist != "" {
		graph += fmt.Sprintf(",drawtext=fontfile=%s:textfile='%s':expansion=none:fontcolor=0x8e8e93:fontsize=%d:x=%s:y=%d",
			cardFont, files[1], artistSize, x, titleY+titleSize+h/48)
	}
	return graph, files
}

// Burn says which subtitles to draw into the video, if any
type Burn struct {
	SRT        string // a subtitle file
	TextTrack  int    // an embedded text track; -1 none
	ImageTrack int    // an embedded picture track (PGS, VobSub, DVB); -1 none
	Offset     float64
}

func filterPath(p string) string { return strings.NewReplacer(`\`, `\\`, `:`, `\:`).Replace(p) }

// movieCommand: ffmpeg arguments for one file, starting start seconds in, with
// audioTrack (0-based) and burn
func movieCommand(path string, start float64, duration float64, audioTrack int, burn Burn, o StreamOpts) (args, temps []string) {
	args = []string{"-fflags", "+genpts+igndts"}
	// Seek before the input (fast), and accurately: it starts at exactly this movie
	// time rather than the keyframe before it, which subtitles depend on
	if start > 0 {
		args = append(args, "-ss", fmt.Sprintf("%.3f", start))
	}
	args = append(args, "-re", "-i", path)

	var videoFilters []string
	if burn.SRT != "" {
		if _, err := os.Stat(burn.SRT); err == nil {
			srt := burn.SRT
			if burn.Offset != 0 {
				if shifted, err := offsetSRT(burn.SRT, burn.Offset); err == nil {
					temps = append(temps, shifted)
					srt = shifted
				}
			}
			videoFilters = append(videoFilters, burnTextSubtitles(fmt.Sprintf("subtitles='%s'", filterPath(srt)), start)...)
		}
	} else if burn.TextTrack >= 0 {
		videoFilters = append(videoFilters, burnTextSubtitles(
			fmt.Sprintf("subtitles='%s':si=%d", filterPath(path), burn.TextTrack), start-burn.Offset)...)
	}

	sound := soundInfo(path)
	if !sound.Video {
		// Sound with no moving picture (music, a podcast): the picture is made here,
		// its cover art and its name on black. Paced by the sound's -re alone: a
		// second -re input halves the speed.
		args = append(args, "-f", "lavfi", "-i", fmt.Sprintf("color=c=black:s=%dx%d:r=30", canvasW, canvasH))
		coverInput := -1
		if sound.Cover >= 0 {
			if cover := extractCover(path, sound.Cover); cover != "" {
				temps = append(temps, cover)
				args = append(args, "-loop", "1", "-framerate", "30", "-i", cover)
				coverInput = 2
			}
		}
		graph, texts := audioCard(sound, stem(path), coverInput, fmt.Sprintf("0:a:%d", audioTrack), nil)
		temps = append(temps, texts...)
		if len(videoFilters) > 0 {
			graph += "," + strings.Join(videoFilters, ",")
		}
		args = append(args, "-filter_complex", graph+"[v]", "-map", "[v]", "-map", "[a]", "-shortest")
		if duration > start { // the picture never ends; the sound does
			args = append(args, "-t", fmt.Sprintf("%.3f", duration-start))
		}
	} else {
		// after subtitles, so they are drawn at the source size and scale with it
		videoFilters = append(videoFilters, fmt.Sprintf(
			"scale=%d:%d:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1",
			canvasW, canvasH, canvasW, canvasH))
		if burn.ImageTrack >= 0 {
			// picture subtitles are a second stream to lay over the video; seeking moves both together
			args = append(args, "-filter_complex",
				fmt.Sprintf("[0:v:0][0:s:%d]overlay,%s[v]", burn.ImageTrack, strings.Join(videoFilters, ",")),
				"-map", "[v]", "-map", fmt.Sprintf("0:a:%d", audioTrack))
		} else {
			args = append(args, "-map", "0:v:0", "-map", fmt.Sprintf("0:a:%d", audioTrack),
				"-vf", strings.Join(videoFilters, ","))
		}
	}
	return append(args, encodingArgs(o)...), temps
}

// Player runs one ffmpeg at a time. Positions (seconds into the movie just sent)
// and the exit come back through the callbacks, from another goroutine.
type Player struct {
	Log        func(string)
	OnPosition func(float64)
	OnExit     func(code int)

	mu   sync.Mutex
	cmd  *exec.Cmd
	done chan struct{}
}

// Start runs ffmpeg with args (from the commands above); start is the movie time
// the stream begins at, added to ffmpeg's own clock for the positions.
func (p *Player) Start(args, temps []string, start float64, checkURL string) error {
	if checkURL != "" && !serverUp(checkURL) {
		removeAll(temps)
		return fmt.Errorf("nothing is accepting the stream at %s: the app's MediaMTX has stopped", checkURL)
	}
	full := append([]string{"-loglevel", "info", "-nostats", "-progress", "pipe:1"}, args...)
	cmd := exec.Command(firstTool("ffmpeg"), full...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	p.Log("$ ffmpeg " + strings.Join(full, " "))
	if err := cmd.Start(); err != nil {
		removeAll(temps)
		return err
	}
	done := make(chan struct{})
	p.mu.Lock()
	p.cmd, p.done = cmd, done
	p.mu.Unlock()

	var tail []string // the last of what ffmpeg said, for when it fails
	var tailMu sync.Mutex
	var readers sync.WaitGroup
	readers.Add(2)
	go func() {
		defer readers.Done()
		s := bufio.NewScanner(stderr)
		for s.Scan() {
			tailMu.Lock()
			tail = append(tail, s.Text())
			if len(tail) > 20 {
				tail = tail[1:]
			}
			tailMu.Unlock()
		}
	}()
	go func() {
		defer readers.Done()
		s := bufio.NewScanner(stdout)
		for s.Scan() {
			if v, ok := strings.CutPrefix(s.Text(), "out_time_us="); ok && p.OnPosition != nil {
				if us, err := strconv.ParseInt(v, 10, 64); err == nil && us >= 0 {
					p.OnPosition(start + float64(us)/1e6)
				}
			}
		}
	}()
	go func() {
		readers.Wait()
		err := cmd.Wait()
		code := 0
		if err != nil {
			code = 1
			if ee, ok := err.(*exec.ExitError); ok && ee.ExitCode() > 0 {
				code = ee.ExitCode()
			}
			tailMu.Lock()
			p.Log(fmt.Sprintf("ffmpeg exited with %v:\n  %s", err, strings.Join(tail, "\n  ")))
			tailMu.Unlock()
		}
		removeAll(temps)
		close(done)
		if p.OnExit != nil {
			p.OnExit(code)
		}
	}()
	return nil
}

// Running: ffmpeg started and not yet gone
func (p *Player) Running() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.done == nil {
		return false
	}
	select {
	case <-p.done:
		return false
	default:
		return true
	}
}

// Stop: SIGINT, so ffmpeg closes the stream itself; killed if it won't
func (p *Player) Stop() {
	p.mu.Lock()
	cmd, done := p.cmd, p.done
	p.mu.Unlock()
	if done == nil || !p.Running() {
		return
	}
	syscall.Kill(-cmd.Process.Pid, syscall.SIGINT)
	select {
	case <-done:
	case <-time.After(8 * time.Second):
		syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		<-done
	}
}

// serverUp: is anything accepting connections where the stream goes?
func serverUp(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	port := u.Port()
	if port == "" {
		port = "554"
	}
	c, err := net.DialTimeout("tcp", net.JoinHostPort(u.Hostname(), port), 3*time.Second)
	if err != nil {
		return false
	}
	c.Close()
	return true
}

func removeAll(paths []string) {
	for _, p := range paths {
		os.Remove(p)
	}
}
