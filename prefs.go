package main

// The Settings window (Party > Settings…, ⌘,; web/window/prefs.ts): the settings
// as controls, in tabs, each change kept as it's made (SetPrefs), and the
// accounts, the logins kept for download sites (logins.go). The list and the
// settings as JSON are still there, at the end of it, for what has no control.

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// presets: x264's, from the least work (and the most bandwidth for a picture) to the most
var presets = []string{"ultrafast", "superfast", "veryfast", "faster", "fast", "medium"}

// bitrates: the bandwidths the Settings window offers, in kbit/s (prefs.ts names them)
var bitrates = []int{800, 1500, 2500, 4000, 6000}

// nearestBitrate: the choice nearest a bitrate (halfway, the higher), so that the window never
// shows a number that isn't one of them; none set, the default, High
func nearestBitrate(k int) int {
	if k <= 0 {
		return 2500
	}
	best := bitrates[0]
	for _, b := range bitrates {
		if abs(float64(b-k)) <= abs(float64(best-k)) {
			best = b
		}
	}
	return best
}

// Prefs: the settings, as the Settings window shows them
type Prefs struct {
	Countdown       float64      `json:"countdown"`       // seconds of "up next" card before each movie
	Skip            float64      `json:"skip"`            // minutes into the first movie played
	Bitrate         int          `json:"bitrate"`         // the video's, in kbit/s
	Preset          string       `json:"preset"`          // x264's preset: one of presets
	OpenRouterPorts bool         `json:"openRouterPorts"` // ask the router to let friends in
	CacheGB         float64      `json:"cacheGB"`         // downloads kept; 0 for no limit
	Cache           string       `json:"cache"`           // what the download cache holds now ("" for nothing); only shown
	Accounts        []Account    `json:"accounts"`        // only shown: changed by SaveAccount and RemoveAccount
	Sealed          bool         `json:"sealed"`          // only shown: the party file is encrypted
	CheckUpdates    bool         `json:"checkUpdates"`    // look for a newer Mouse Party once a day
	InstallUpdates  bool         `json:"installUpdates"`  // and download it, to go in when the app quits
	Update          UpdateStatus `json:"update"`          // only shown: this version, and where updating has got to
}

// Account: a site's kept login, as the window lists it (never its password)
type Account struct {
	Site string `json:"site"`
	User string `json:"user"`
}

// LinkLogin: the login for a link's site, for the Add Download Link sheet to fill in
type LinkLogin struct {
	Site  string `json:"site"`  // "" when it isn't a link yet
	User  string `json:"user"`  // "" when nothing is kept for it
	Pass  string `json:"pass"`  //
	Saved bool   `json:"saved"` // kept in the party file (false: only until the app quits, or none)
}

// kbps: a bitrate setting ("1500k", "2M", "800000") in kbit/s
func kbps(s string) int {
	s = strings.ToLower(strings.TrimSpace(s))
	n, err := strconv.ParseFloat(regexp.MustCompile(`[^0-9.]`).ReplaceAllString(s, ""), 64)
	if err != nil {
		return 0
	}
	switch {
	case strings.HasSuffix(s, "m"):
		return int(n * 1000)
	case strings.HasSuffix(s, "k"):
		return int(n)
	}
	return int(n / 1000)
}

// Prefs: the settings now
func (a *App) Prefs() Prefs {
	var p Prefs
	a.wait(func() {
		p = Prefs{Countdown: float64(a.cfg.Countdown), Skip: float64(a.cfg.Skip), Bitrate: kbps(a.cfg.Bitrate), Preset: a.cfg.Preset,
			OpenRouterPorts: a.cfg.OpenRouterPorts, CacheGB: float64(a.cfg.CacheGB), Accounts: a.accounts(),
			Sealed: a.party != nil && a.party.sealed, CheckUpdates: a.cfg.CheckUpdates, InstallUpdates: a.cfg.InstallUpdates,
			Update: a.updateStatus()}
	})
	p.Cache = a.CacheText()
	return p
}

// SetPrefs keeps the settings as the window has them now; "" or why not (nothing changes then).
// What's playing goes on as it is: the streaming settings are for the next thing played, the
// router's for the next time hosting starts.
func (a *App) SetPrefs(p Prefs) string {
	switch {
	case p.Countdown < 0 || p.Countdown > 600:
		return "The countdown is from 0 to 600 seconds"
	case p.Skip < 0 || p.Skip > 600:
		return "The first movie starts from 0 to 600 minutes in"
	case nearestBitrate(p.Bitrate) != p.Bitrate:
		return "That isn't a bandwidth Mouse Party offers"
	case !strings.Contains(" "+strings.Join(presets, " ")+" ", " "+p.Preset+" "):
		return "That isn't an encoding effort Mouse Party knows"
	case p.CacheGB < 0 || p.CacheGB > 100000:
		return "The cache is from 0 (no limit) to 100,000 GB"
	}
	result := ""
	a.wait(func() {
		if a.locked {
			result = "The party is sealed: open it first"
			return
		}
		smaller := p.CacheGB > 0 && (a.cfg.CacheGB == 0 || Number(p.CacheGB) < a.cfg.CacheGB)
		a.cfg.Countdown, a.cfg.Skip, a.cfg.Bitrate, a.cfg.Preset = Number(p.Countdown), Number(p.Skip), fmt.Sprintf("%dk", p.Bitrate), p.Preset
		a.cfg.OpenRouterPorts, a.cfg.CacheGB = p.OpenRouterPorts, Number(p.CacheGB)
		a.cfg.CheckUpdates, a.cfg.InstallUpdates = p.CheckUpdates, p.InstallUpdates
		a.save()
		if smaller {
			a.trimCache(a.cacheLimit())
		}
	})
	return result
}

// accounts: the sites with a kept login, in order
func (a *App) accounts() []Account {
	list := []Account{}
	for site, l := range a.logins() {
		list = append(list, Account{Site: site, User: l.User})
	}
	sortAccounts(list)
	return list
}

// SaveAccount keeps a login for a site (named, or by a link to it), in place of any it had; "" or why not
func (a *App) SaveAccount(site, user, pass string) string {
	site = accountSite(site)
	switch {
	case site == "":
		return "Type the site, as example.com or a link to it"
	case strings.TrimSpace(user) == "":
		return "Type the username"
	}
	result := ""
	a.wait(func() {
		if a.locked || a.party == nil {
			result = "The party is sealed: open it first"
			return
		}
		a.setLogin(site, siteLogin{User: strings.TrimSpace(user), Pass: pass})
		delete(a.tempLogins, site)
		a.retryLoginWanted(site)
	})
	return result
}

// RemoveAccount forgets a site's login; "" or why not
func (a *App) RemoveAccount(site string) string {
	result := ""
	a.wait(func() {
		if a.locked || a.party == nil {
			result = "The party is sealed: open it first"
			return
		}
		a.forgetLogin(site)
		delete(a.tempLogins, site)
	})
	return result
}

// LoginFor: the login the Add Download Link sheet fills in for a link: one written into it, or the
// one kept for its site (or used for it since the app started)
func (a *App) LoginFor(link string) LinkLogin {
	u, written, why := checkLink(link)
	if why != "" {
		return LinkLogin{}
	}
	ll := LinkLogin{Site: siteOf(u.Hostname())}
	if written != nil {
		ll.User, ll.Pass = written.User, written.Pass
		return ll
	}
	a.wait(func() {
		if l, ok := a.tempLogins[ll.Site]; ok {
			ll.User, ll.Pass = l.User, l.Pass
		} else if l, ok := a.logins()[ll.Site]; ok {
			ll.User, ll.Pass, ll.Saved = l.User, l.Pass, true
		}
	})
	return ll
}

// accountSite: the site a name or a link means ("" for neither)
func accountSite(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}
	u, _, why := checkLink(s)
	if why != "" || !strings.Contains(u.Hostname(), ".") && u.Hostname() != "localhost" {
		return ""
	}
	return siteOf(u.Hostname())
}
