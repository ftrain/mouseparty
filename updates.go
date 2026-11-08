package main

// Updates: Mouse Party looks for a newer release of itself on GitHub (this
// repo's releases, tagged vX.Y.Z, each with the app's zip and that zip's SHA-256
// beside it, as .github/workflows/mac-app.yml publishes them), at start and once
// a day when Settings > General says so, or when asked (Party > Check for
// Updates…). A newer one is downloaded into the cache, checked (its SHA-256, its
// signature, its bundle's name and version) and unpacked beside this app, hidden;
// it takes this app's place when Mouse Party quits (shutdown), or at once with
// Restart to Update, so a party going on is never cut short. A build made here
// says so ("dev") and never updates itself; neither does an app macOS runs from a
// read-only copy (one opened from Downloads: App Translocation), or one in a
// folder this user can't write to.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// version: this build's, set by scripts/build_mac_app.sh (-ldflags "-X main.version=3.1.0"); "dev" otherwise
var version = "dev"

const (
	updateAsset  = "MouseParty-macos-arm64.zip"  // the app, in each release
	updateBundle = "io.github.ftrain.mouseparty" // what an update's Info.plist must say it is (packaging/darwin/Info.plist)
	updateEvery  = 24 * time.Hour
)

// updatesAPI: this repo's releases (tests point it at their own)
var updatesAPI = "https://api.github.com/repos/ftrain/mouseparty/releases?per_page=30"

// updater: where updating has got to (on the App, touched on its goroutine)
type updater struct {
	state      string // "", "checking", "current", "available", "downloading", "ready", "error"
	latest     string // the newest release's version, once known
	note       string // why not, for "error"
	got, total int64  // bytes of the download, while "downloading"
	staged     string // the new app, unpacked beside this one, while "ready"
	checked    time.Time
	restart    bool // Restart to Update: open the new app once this one has gone
}

// UpdateStatus: what Settings says of updates
type UpdateStatus struct {
	Version string `json:"version"` // this app's ("dev" for a build made here)
	State   string `json:"state"`   // as updater.state
	Latest  string `json:"latest"`
	Text    string `json:"text"`  // the sentence Settings shows
	Ready   bool   `json:"ready"` // Restart to Update would install it
	Busy    bool   `json:"busy"`  // checking or downloading: Settings looks again soon
}

// semver: "v3.1.0" or "3.1.0" as numbers; ok false for anything else (a tag that isn't a release of the app)
func semver(s string) (v [3]int, ok bool) {
	parts := strings.Split(strings.TrimPrefix(s, "v"), ".")
	if len(parts) != 3 {
		return v, false
	}
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 || p != strconv.Itoa(n) {
			return v, false
		}
		v[i] = n
	}
	return v, true
}

// newer: a is a later version than b
func newer(a, b string) bool {
	va, oka := semver(a)
	vb, okb := semver(b)
	if !oka || !okb {
		return false
	}
	for i := range va {
		if va[i] != vb[i] {
			return va[i] > vb[i]
		}
	}
	return false
}

// release: the newest release of the app, as GitHub lists it
type release struct {
	Version  string
	Zip, Sum string // their download URLs
	Size     int64
}

// latestRelease: the highest vX.Y.Z release that has the app's zip and its SHA-256 (drafts and prereleases aside)
func latestRelease(ctx context.Context) (*release, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", updatesAPI, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mouse Party")
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return nil, errors.New(shortNetError(err))
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub said %s", resp.Status)
	}
	var list []struct {
		Tag        string `json:"tag_name"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
		Assets     []struct {
			Name string `json:"name"`
			URL  string `json:"browser_download_url"`
			Size int64  `json:"size"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&list); err != nil {
		return nil, fmt.Errorf("GitHub's list of releases didn't read: %v", err)
	}
	var best *release
	for _, r := range list {
		if _, ok := semver(r.Tag); !ok || r.Draft || r.Prerelease {
			continue
		}
		rel := release{Version: strings.TrimPrefix(r.Tag, "v")}
		for _, a := range r.Assets {
			switch a.Name {
			case updateAsset:
				rel.Zip, rel.Size = a.URL, a.Size
			case updateAsset + ".sha256":
				rel.Sum = a.URL
			}
		}
		if rel.Zip != "" && rel.Sum != "" && (best == nil || newer(rel.Version, best.Version)) {
			best = &rel
		}
	}
	if best == nil {
		return nil, errors.New("no release of the app is there yet")
	}
	return best, nil
}

// thisBundle: the app this program is in, and why it can't be updated where it is ("" if it can)
func (a *App) thisBundle() (string, string) {
	path := a.bundlePath
	if path == "" {
		exe, err := os.Executable()
		if err != nil {
			return "", "where Mouse Party is isn't known"
		}
		exe, _ = filepath.EvalSymlinks(exe)
		path = filepath.Dir(filepath.Dir(filepath.Dir(exe))) // …/Mouse Party.app/Contents/MacOS/MouseParty
	}
	switch {
	case !strings.HasSuffix(path, ".app"):
		return path, "this isn't the app (it's run from its source)"
	case strings.Contains(path, "/AppTranslocation/"):
		return path, "macOS is running a read-only copy of it: move Mouse Party to Applications, open it from there, and it can update itself"
	}
	probe, err := os.CreateTemp(filepath.Dir(path), ".mouseparty-update-")
	if err != nil {
		return path, "it can't write to " + filepath.Dir(path) + ": move Mouse Party to Applications"
	}
	probe.Close()
	os.Remove(probe.Name())
	return path, ""
}

// stagingDir: where an update is unpacked, beside the app (the same disk, so it moves in at once)
func stagingDir(bundle string) string {
	return filepath.Join(filepath.Dir(bundle), ".Mouse Party update")
}

// autoUpdate: once a day, if Settings says so; downloading what it finds if Settings says that too
func (a *App) autoUpdate() {
	if a.locked || !a.cfg.CheckUpdates || version == "dev" || time.Since(a.update.checked) < updateEvery {
		return
	}
	a.checkUpdates(a.cfg.InstallUpdates)
}

// CheckForUpdates: Party > Check for Updates…, or Settings' Check Now: looks, and downloads a newer one
func (a *App) CheckForUpdates() { a.do(func() { a.checkUpdates(true) }) }

// checkUpdates looks for a newer release (off the app's goroutine), and downloads it if install
func (a *App) checkUpdates(install bool) {
	u := &a.update
	if u.state == "checking" || u.state == "downloading" {
		return
	}
	if u.state == "ready" { // one is waiting already: nothing newer is fetched over it until it's in
		return
	}
	if version == "dev" {
		u.state, u.note = "error", "This is a development build: it doesn't update itself."
		return
	}
	u.state, u.checked = "checking", time.Now()
	go func() {
		rel, err := latestRelease(context.Background())
		a.do(func() {
			switch {
			case err != nil:
				u.state, u.note = "error", "Couldn't check for updates: "+err.Error()
			case !newer(rel.Version, version):
				u.state, u.latest = "current", rel.Version
			default:
				u.state, u.latest = "available", rel.Version
				a.log("Mouse Party " + rel.Version + " is out")
				if install {
					a.downloadUpdate(rel)
				}
			}
			a.setMenu()
		})
	}()
}

// downloadUpdate fetches the release's zip into the cache, checks it, and unpacks it beside this app (off the app's goroutine)
func (a *App) downloadUpdate(rel *release) {
	u := &a.update
	bundle, why := a.thisBundle()
	if why != "" {
		u.state, u.note = "error", fmt.Sprintf("Mouse Party %s is out, but this one can't update itself: %s.", rel.Version, why)
		return
	}
	u.state, u.got, u.total = "downloading", 0, rel.Size
	go func() {
		staged, err := fetchUpdate(rel, bundle, func(got, total int64) { a.do(func() { u.got, u.total = got, total }) })
		a.do(func() {
			if err != nil {
				u.state, u.note = "error", "Couldn't download Mouse Party "+rel.Version+": "+err.Error()
				a.log(u.note)
			} else {
				u.state, u.staged = "ready", staged
				a.log("Mouse Party " + rel.Version + " is downloaded: it goes in when Mouse Party quits (or Party > Restart to Update)")
			}
			a.setMenu()
		})
	}()
}

// fetchUpdate: the release's zip, its SHA-256 checked, unpacked beside bundle, the app in it checked; its path
func fetchUpdate(rel *release, bundle string, step func(got, total int64)) (string, error) {
	cache, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(cache, "Mouse Party", "update")
	os.RemoveAll(dir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	defer os.RemoveAll(dir)
	want, err := fetchSum(rel.Sum)
	if err != nil {
		return "", err
	}
	zip := filepath.Join(dir, updateAsset)
	if _, err := fetch(context.Background(), rel.Zip, zip, nil, func(_ string, got, total int64) { step(got, total) }); err != nil {
		return "", err
	}
	f, err := os.Open(zip)
	if err != nil {
		return "", err
	}
	h := sha256.New()
	_, err = io.Copy(h, f)
	f.Close()
	if err != nil {
		return "", err
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != want {
		return "", errors.New("it isn't what the release says it is (its SHA-256 differs)")
	}
	stage := stagingDir(bundle)
	os.RemoveAll(stage)
	if out, err := exec.Command("/usr/bin/ditto", "-x", "-k", zip, stage).CombinedOutput(); err != nil {
		os.RemoveAll(stage)
		return "", fmt.Errorf("it didn't unzip: %s", strings.TrimSpace(string(out)))
	}
	app := filepath.Join(stage, filepath.Base(bundle))
	if _, err := os.Stat(app); err != nil {
		app = filepath.Join(stage, "Mouse Party.app")
	}
	if why := checkBundle(app, rel.Version, teamOf(bundle)); why != "" {
		os.RemoveAll(stage)
		return "", errors.New(why)
	}
	return app, nil
}

// fetchSum: the SHA-256 a release gives for its zip (the first word of its .sha256 file)
func fetchSum(link string) (string, error) {
	req, _ := http.NewRequest("GET", link, nil)
	req.Header.Set("User-Agent", "Mouse Party")
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return "", errors.New(shortNetError(err))
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
	fields := strings.Fields(string(b))
	if resp.StatusCode != http.StatusOK || len(fields) == 0 || len(fields[0]) != 64 {
		return "", errors.New("the release has no SHA-256 to check it by")
	}
	return strings.ToLower(fields[0]), nil
}

// checkBundle: why the unpacked app isn't the update it should be ("" when it is): whole as signed, Mouse Party, that version
func checkBundle(app, want, team string) string {
	if out, err := exec.Command("/usr/bin/codesign", "--verify", "--deep", "--strict", app).CombinedOutput(); err != nil {
		return "its signature doesn't check: " + strings.TrimSpace(string(out))
	}
	if team != "" { // this Mouse Party has a Developer ID: an update must be signed by the same developer
		req := fmt.Sprintf(`=anchor apple generic and certificate leaf[subject.OU] = "%s"`, team)
		if out, err := exec.Command("/usr/bin/codesign", "--verify", "--deep", "--strict", "-R", req, app).CombinedOutput(); err != nil {
			return "it isn't signed by Mouse Party's developer (" + team + "): " + strings.TrimSpace(string(out))
		}
	}
	plist := filepath.Join(app, "Contents", "Info.plist")
	read := func(key string) string {
		out, _ := exec.Command("/usr/libexec/PlistBuddy", "-c", "Print :"+key, plist).Output()
		return strings.TrimSpace(string(out))
	}
	if id := read("CFBundleIdentifier"); id != updateBundle {
		return "it isn't Mouse Party (" + id + ")"
	}
	if v := read("CFBundleShortVersionString"); v != want {
		return fmt.Sprintf("it says it's version %q, not %s", v, want)
	}
	return ""
}

// teamOf: the Developer ID team that signed an app; "" when it's signed ad hoc (or not at all)
func teamOf(app string) string {
	out, _ := exec.Command("/usr/bin/codesign", "-dv", "--verbose=2", app).CombinedOutput()
	for _, line := range strings.Split(string(out), "\n") {
		if t, ok := strings.CutPrefix(line, "TeamIdentifier="); ok && t != "not set" {
			return strings.TrimSpace(t)
		}
	}
	return ""
}

// installUpdate puts the downloaded app in this one's place (at quitting): this one aside, the new one in, this one deleted
func (a *App) installUpdate() error {
	u := &a.update
	if u.state != "ready" || u.staged == "" {
		return nil
	}
	bundle, why := a.thisBundle()
	if why != "" {
		return errors.New(why)
	}
	old := filepath.Join(stagingDir(bundle), "old.app")
	os.RemoveAll(old)
	if err := os.Rename(bundle, old); err != nil {
		return err
	}
	if err := os.Rename(u.staged, bundle); err != nil {
		os.Rename(old, bundle) // put back as it was
		return err
	}
	os.RemoveAll(stagingDir(bundle))
	a.log("Updated to Mouse Party " + u.latest)
	u.state, u.staged = "", ""
	return nil
}

// RestartToUpdate: Party > Restart to Update: quit, the update put in, and the new app opened
func (a *App) RestartToUpdate() {
	ready := false
	a.wait(func() {
		ready = a.update.state == "ready"
		a.update.restart = ready
	})
	if ready && a.ctx != nil {
		runtime.Quit(a.ctx)
	}
}

// reopen opens the app at path once this process has gone (Restart to Update)
func reopen(path string) {
	cmd := exec.Command("/bin/sh", "-c", `sleep 1; exec /usr/bin/open "$0"`, path)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true} // not stopped with us
	cmd.Start()
}

// updateStatus: what Settings says
func (a *App) updateStatus() UpdateStatus {
	u := a.update
	s := UpdateStatus{Version: version, State: u.state, Latest: u.latest, Ready: u.state == "ready", Busy: u.state == "checking" || u.state == "downloading"}
	switch u.state {
	case "checking":
		s.Text = "Checking for updates…"
	case "current":
		s.Text = "Mouse Party is up to date."
	case "available":
		s.Text = "Mouse Party " + u.latest + " is out."
	case "downloading":
		s.Text = "Downloading Mouse Party " + u.latest + "…"
		if u.total > 0 {
			s.Text = fmt.Sprintf("Downloading Mouse Party %s… %d%%", u.latest, u.got*100/u.total)
		}
	case "ready":
		s.Text = "Mouse Party " + u.latest + " is ready. It goes in when Mouse Party quits, or now with Restart to Update."
	case "error":
		s.Text = u.note
	default:
		if version == "dev" {
			s.Text = "This is a development build: it doesn't update itself."
		} else if !u.checked.IsZero() {
			s.Text = "Last checked " + u.checked.Format("3:04 PM") + "."
		}
	}
	return s
}
