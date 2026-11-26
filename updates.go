package main

// Updates: Mouse Party looks for a newer release of itself on GitHub (this
// repo's releases, tagged vX.Y.Z, each with the app's file for each platform and
// GitHub's SHA-256 of it, as .github/workflows/app.yml publishes them), at start and once
// a day when Settings > General says so, or when asked (Party > Check for
// Updates…). A newer one is downloaded into the cache and checked; it takes this
// app's place when Mouse Party quits (shutdown), or at once with Restart to
// Update, so a party going on is never cut short. A build made here
// says so ("dev") and never updates itself; neither does an app macOS runs from a
// read-only copy (one opened from Downloads: App Translocation), or one in a
// folder this user can't write to.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/ftrain/mouseparty/internal/releasesig"
)

// version: this build's, set by scripts/build_mac_app.sh (-ldflags "-X main.version=3.1.0"); "dev" otherwise
var version = "dev"

const updateEvery = 24 * time.Hour

// updatesAPI: this repo's releases (tests point it at their own)
var updatesAPI = "https://api.github.com/repos/ftrain/mouseparty/releases?per_page=30"

// releaseKey: the minisign key every release's app file is signed with (tests use their own)
var releaseKey = releasesig.PublicKey

// updater: where updating has got to (on the App, touched on its goroutine)
type updater struct {
	state      string // "", "checking", "current", "available", "downloading", "ready", "error"
	latest     string // the newest release's version, once known
	note       string // why not, for "error"
	got, total int64  // bytes of the download, while "downloading"
	staged     string // the update, while "ready"
	checked    time.Time
	restart    bool // Restart to Update: open the new app once this one has gone
	page       string
	tidied     bool
}

// UpdateStatus: what Settings says of updates
type UpdateStatus struct {
	Version string `json:"version"` // this app's ("dev" for a build made here)
	State   string `json:"state"`   // as updater.state
	Latest  string `json:"latest"`
	Text    string `json:"text"`  // the sentence Settings shows
	Ready   bool   `json:"ready"` // Restart to Update would install it
	Busy    bool   `json:"busy"`  // checking or downloading: Settings looks again soon
	// Page: the newer release's page, when this install is updated by hand
	Page string `json:"page,omitempty"`
	// Manual: this install never updates itself, so Install automatically means nothing
	Manual bool `json:"manual,omitempty"`
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
	Version string
	URL     string // the download of its updateAsset
	Sum     string // its SHA-256, as GitHub gives it (hex)
	SigURL  string // the download of its minisign signature (updateAsset + ".minisig"); "" when the release has none
	Size    int64
	Page    string
}

// latestRelease: the highest vX.Y.Z release that has updateAsset, with the SHA-256 GitHub gives it (drafts and prereleases aside)
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
		Page       string `json:"html_url"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
		Assets     []struct {
			Name   string `json:"name"`
			URL    string `json:"browser_download_url"`
			Size   int64  `json:"size"`
			Digest string `json:"digest"` // "sha256:…", GitHub's own of the file uploaded
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
		rel := release{Version: strings.TrimPrefix(r.Tag, "v"), Page: r.Page}
		for _, a := range r.Assets {
			if sum, ok := strings.CutPrefix(a.Digest, "sha256:"); a.Name == updateAsset && ok && len(sum) == 64 {
				rel.URL, rel.Sum, rel.Size = a.URL, strings.ToLower(sum), a.Size
			}
			if a.Name == updateAsset+".minisig" {
				rel.SigURL = a.URL
			}
		}
		if rel.URL != "" && (best == nil || newer(rel.Version, best.Version)) {
			best = &rel
		}
	}
	if best == nil {
		return nil, errors.New("no release of the app is there yet")
	}
	return best, nil
}

// fetchSig: the release's signature of its updateAsset (small, so in memory)
func fetchSig(rel *release) ([]byte, error) {
	if rel.SigURL == "" {
		return nil, errors.New("the release isn't signed")
	}
	req, err := http.NewRequest("GET", rel.SigURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mouse Party")
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return nil, errors.New(shortNetError(err))
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("its signature didn't download: %s", resp.Status)
	}
	return io.ReadAll(io.LimitReader(resp.Body, releasesig.SigMax))
}

// checkSigned: the file at path is the release's updateAsset, signed with Mouse Party's release key for its version
func checkSigned(path string, sig []byte, version string) error {
	return releasesig.Check(releaseKey, path, sig, version, updateAsset)
}

// fetchSigned: the release's signature, fetched and checked against the file at path; it's returned to be checked again later
func fetchSigned(rel *release, path string) ([]byte, error) {
	sig, err := fetchSig(rel)
	if err == nil {
		err = checkSigned(path, sig, rel.Version)
	}
	return sig, err
}

// stagingDir: where an update is unpacked, beside the app (the same disk, so it moves in at once)
func stagingDir(bundle string) string {
	return filepath.Join(filepath.Dir(bundle), ".Mouse Party update")
}

func updateDir() (string, error) {
	d := cacheDir()
	if d == "" {
		return "", errors.New("where to download it isn't known")
	}
	return filepath.Join(d, "update"), nil
}

// autoUpdate: once a day, if Settings says so; downloading what it finds if Settings says that too
func (a *App) autoUpdate() {
	if !a.update.tidied {
		a.update.tidied = true
		a.tidyUpdate()
	}
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
		u.state, u.note = "error", "A development build doesn't update."
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
				u.state, u.latest, u.page = "available", rel.Version, rel.Page
				a.log("Mouse Party " + rel.Version + " is out")
				if install && a.updateByHand() == "" {
					a.downloadUpdate(rel)
				}
			}
			a.setMenu()
		})
	}()
}

// downloadUpdate fetches the release's updateAsset into the cache and checks it (off the app's goroutine)
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
				a.log("Mouse Party " + rel.Version + " is downloaded: it goes in when Mouse Party quits (or " + restartItem + ")")
			}
			a.setMenu()
		})
	}()
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

// updateStatus: what Settings says
func (a *App) updateStatus() UpdateStatus {
	u := a.update
	how := ""
	if version != "dev" {
		how = a.updateByHand()
	}
	s := UpdateStatus{Version: version, State: u.state, Latest: u.latest, Ready: u.state == "ready", Busy: u.state == "checking" || u.state == "downloading",
		Manual: how != ""}
	switch u.state {
	case "checking":
		s.Text = "Checking for updates…"
	case "current":
		s.Text = "Mouse Party is up to date."
	case "available":
		s.Text = "Mouse Party " + u.latest + " is out."
		if how != "" {
			s.Text, s.Page = "Mouse Party "+u.latest+" is out: "+how+".", u.page
		}
	case "downloading":
		s.Text = "Downloading Mouse Party " + u.latest + "…"
		if u.total > 0 {
			s.Text = fmt.Sprintf("Downloading Mouse Party %s… %d%%", u.latest, u.got*100/u.total)
		}
	case "ready":
		s.Text = u.latest + " is ready."
	case "error":
		s.Text = u.note
	default:
		if version == "dev" {
			s.Text = "A development build doesn't update."
		} else if !u.checked.IsZero() {
			s.Text = "Last checked " + u.checked.Format("3:04 PM") + "."
		}
	}
	return s
}
