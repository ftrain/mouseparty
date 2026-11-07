package main

// Logins for download links: a site that wants its username and password with
// every download (HTTP Basic auth, as Easynews's members' links do) is given
// them, so a link never needs a browser's session, which runs out. A login is
// kept for the link's site (its registered domain, so easynews.com covers
// members.easynews.com and the servers it sends a download on to) in the party
// file, under its own key, never in the Settings text (sealing the party
// encrypts it), and sent only to that site, and only over https (or plain http
// to this Mac).

import (
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"strings"

	"golang.org/x/net/publicsuffix"
)

// siteLogin: a username and password, for one site
type siteLogin struct {
	User string `json:"user"`
	Pass string `json:"pass"`
}

// siteOf: a host's site, the domain it is registered under (members.easynews.com: easynews.com)
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

// loginFor: the login kept for a link's site, if there is one
func (a *App) loginFor(link string) *siteLogin {
	u, err := url.Parse(link)
	if err != nil {
		return nil
	}
	if l, ok := a.logins()[siteOf(u.Hostname())]; ok && l.User != "" {
		return &l
	}
	return nil
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
