package main

// Logins for download links: a site that wants its username and password with
// every download (HTTP Basic auth, as file services' members' links do) is given
// them, so a link never needs a browser's session, which runs out. A login is
// for the link's site (its registered domain, so example.com covers
// members.example.com and the servers it sends a download on to), kept in the
// party file under its own key, never in the Settings text (sealing the party
// encrypts it), or, when the sheet's "Save this login" is off, only until the app
// quits (App.tempLogins); and sent only to that site, and only over https (or
// plain http to this Mac). The Settings window's Accounts tab lists, adds and
// removes them (prefs.go).

import (
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"golang.org/x/net/publicsuffix"
)

// siteLogin: a username and password, for one site
type siteLogin struct {
	User string `json:"user"`
	Pass string `json:"pass"`
}

// siteOf: a host's site, the domain it is registered under (members.example.com: example.com)
func siteOf(host string) string {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	if net.ParseIP(host) != nil {
		return host
	}
	if site, err := publicsuffix.EffectiveTLDPlusOne(host); err == nil {
		return site
	}
	return host
}

// loginSafe: whether a login may go with this request: over https, or to this Mac
func loginSafe(u *url.URL) bool {
	if u.Scheme == "https" {
		return true
	}
	host := u.Hostname()
	ip := net.ParseIP(host)
	return u.Scheme == "http" && (host == "localhost" || ip != nil && ip.IsLoopback())
}

// logins: every site's login kept in the party file (none when nothing is kept)
func (a *App) logins() map[string]siteLogin {
	all := map[string]siteLogin{}
	if a.party != nil {
		if b, ok := a.party.setting("logins"); ok {
			json.Unmarshal(b, &all)
		}
	}
	return all
}

// setLogin keeps a site's login in the party file
func (a *App) setLogin(site string, l siteLogin) {
	if a.party == nil {
		return
	}
	all := a.logins()
	all[site] = l
	if b, err := json.Marshal(all); err == nil {
		a.party.setSetting("logins", b)
	}
}

// forgetLogin takes a site's login out of the party file
func (a *App) forgetLogin(site string) {
	all := a.logins()
	if _, ok := all[site]; !ok || a.party == nil {
		return
	}
	delete(all, site)
	if b, err := json.Marshal(all); err == nil {
		a.party.setSetting("logins", b)
	}
}

// loginFor: the login for a link's site, if there is one: one given since the app started
// and not saved, else the one kept
func (a *App) loginFor(link string) *siteLogin {
	u, err := url.Parse(link)
	if err != nil {
		return nil
	}
	site := siteOf(u.Hostname())
	if l, ok := a.tempLogins[site]; ok {
		return &l
	}
	if l, ok := a.logins()[site]; ok && l.User != "" {
		return &l
	}
	return nil
}

// retryLoginWanted tries again the site's downloads that stopped short (wanting a login, say), now that it has one
func (a *App) retryLoginWanted(site string) {
	for _, it := range a.cfg.Queue {
		if u, err := url.Parse(it.URL); err == nil && it.downloading() && it.dl == nil && !it.Cleared && siteOf(u.Hostname()) == site {
			a.retryDownload(it)
		}
	}
}

func sortAccounts(list []Account) {
	sort.Slice(list, func(i, j int) bool { return list[i].Site < list[j].Site })
}

// withLogin: a transport that adds the login to every request to its site (the first, and any
// redirect within the site, which Go's client would otherwise send without it), never to another
type withLogin struct {
	base  http.RoundTripper
	site  string
	login siteLogin
}

func (t withLogin) RoundTrip(req *http.Request) (*http.Response, error) {
	if siteOf(req.URL.Hostname()) == t.site && loginSafe(req.URL) {
		req = req.Clone(req.Context())
		req.SetBasicAuth(t.login.User, t.login.Pass)
	}
	return t.base.RoundTrip(req)
}
