package main

import (
	"strings"
	"testing"
)

// The Settings window: the settings as they are, changed one at a time and kept, refused out of
// range (nothing changing then); the accounts listed without their passwords, added by a site's
// name or a link to it, replaced, removed; and the login the Add Download Link sheet fills in.
func TestPrefs(t *testing.T) {
	t.Setenv("HOME", t.TempDir()) // never the real party file
	t.Setenv("XDG_CACHE_HOME", "")
	a := NewApp(standby)
	go a.run()
	defer a.shutdown(nil)

	p := a.Prefs()
	if p.Countdown != 10 || p.Bitrate != 1500 || p.Preset != "veryfast" || p.CacheGB != 20 || !p.OpenRouterPorts || p.Sealed || len(p.Accounts) != 0 {
		t.Fatalf("the defaults: %+v", p)
	}
	p.Countdown, p.Bitrate, p.Preset, p.CacheGB, p.OpenRouterPorts, p.Skip = 3, 4000, "fast", 50, false, 2
	if why := a.SetPrefs(p); why != "" {
		t.Fatal(why)
	}
	a.wait(func() {
		if c := a.cfg; c.Countdown != 3 || c.Bitrate != "4000k" || c.Preset != "fast" || c.CacheGB != 50 || c.OpenRouterPorts || c.Skip != 2 {
			t.Errorf("kept: %+v", c)
		}
	})
	if got := a.Prefs(); got.Bitrate != 4000 || got.Countdown != 3 {
		t.Errorf("read back: %+v", got)
	}
	for _, bad := range []func(p *Prefs){
		func(p *Prefs) { p.Countdown = -1 }, func(p *Prefs) { p.Bitrate = 10 }, func(p *Prefs) { p.Preset = "placebo" },
		func(p *Prefs) { p.CacheGB = -2 }, func(p *Prefs) { p.Skip = 9000 },
	} {
		q := a.Prefs()
		bad(&q)
		if why := a.SetPrefs(q); why == "" {
			t.Errorf("taken: %+v", q)
		}
	}
	if got := a.Prefs(); got.Countdown != 3 || got.Preset != "fast" {
		t.Errorf("a refused change changed something: %+v", got)
	}
	for in, want := range map[string]int{"1500k": 1500, "2M": 2000, "800000": 800, "2.5m": 2500, "": 0} {
		if got := kbps(in); got != want {
			t.Errorf("kbps(%q) = %d, not %d", in, got, want)
		}
	}

	// accounts
	for _, bad := range [][2]string{{"", "ann"}, {"nothing", "ann"}, {"example.com", " "}} {
		if why := a.SaveAccount(bad[0], bad[1], "pw"); why == "" {
			t.Errorf("SaveAccount(%q, %q) taken", bad[0], bad[1])
		}
	}
	if why := a.SaveAccount("https://members.example.com/dl/x.mkv?sig=1", " ann ", "s3cret"); why != "" {
		t.Fatal(why)
	}
	if why := a.SaveAccount("other.org", "bob", "pw"); why != "" {
		t.Fatal(why)
	}
	if why := a.SaveAccount("www.example.com", "ann2", "n3w"); why != "" { // the same site: replaced
		t.Fatal(why)
	}
	got := a.Prefs().Accounts
	if len(got) != 2 || got[0] != (Account{"example.com", "ann2"}) || got[1] != (Account{"other.org", "bob"}) {
		t.Fatalf("accounts: %+v", got)
	}
	if ll := a.LoginFor("https://cdn.example.com/a/b.mkv"); ll != (LinkLogin{Site: "example.com", User: "ann2", Pass: "n3w", Saved: true}) {
		t.Errorf("LoginFor a saved site: %+v", ll)
	}
	if ll := a.LoginFor("https://zed:pw@nowhere.net/x.mkv"); ll != (LinkLogin{Site: "nowhere.net", User: "zed", Pass: "pw"}) {
		t.Errorf("LoginFor a link with its login in it: %+v", ll)
	}
	if ll := a.LoginFor("https://nowhere.net/x.mkv"); ll != (LinkLogin{Site: "nowhere.net"}) {
		t.Errorf("LoginFor a site with none: %+v", ll)
	}
	if ll := a.LoginFor("not a link"); ll != (LinkLogin{}) {
		t.Errorf("LoginFor no link: %+v", ll)
	}
	if why := a.RemoveAccount("other.org"); why != "" {
		t.Fatal(why)
	}
	if got := a.Prefs().Accounts; len(got) != 1 || got[0].Site != "example.com" {
		t.Errorf("after removing: %+v", got)
	}
	if text := a.SettingsText(); strings.Contains(text, "n3w") || strings.Contains(text, "ann2") {
		t.Error("a login is in the Settings text")
	}
}
