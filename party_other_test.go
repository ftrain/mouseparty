//go:build !darwin

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Something Erase All Data can't delete yet (held open on Windows) doesn't keep the app from
// quitting: it's said in the log, and what's left goes once the app has gone
func TestEraseAllStillQuits(t *testing.T) {
	tempHome(t)
	a := testApp(t)
	held := filepath.Join(dataDir(), "held", "file")
	os.MkdirAll(filepath.Dir(held), 0o700)
	os.WriteFile(held, []byte("x"), 0o600)
	if !hold(t, held) {
		t.Skip("needs a folder its owner can't delete from")
	}
	if msg := a.EraseAll(); msg != "" {
		t.Fatal("it wouldn't quit:", msg)
	}
	var erased bool
	a.wait(func() { erased = a.erased })
	if said := a.LogText(); !erased || !strings.Contains(said, "once Mouse Party has quit") || strings.Contains(said, "is erased") {
		t.Fatal(erased, said)
	}
	if _, err := os.Stat(partyPath()); !os.IsNotExist(err) {
		t.Fatal("the party file is still there")
	}
}

// Open House Party was only ever a Mac app: elsewhere a folder of its name is another program's,
// never taken in, renamed or erased
func TestNoOpenHousePartyHere(t *testing.T) {
	tempHome(t)
	config, err := os.UserConfigDir()
	if err != nil {
		t.Fatal(err)
	}
	other := filepath.Join(config, "Open House Party", "settings.json")
	os.MkdirAll(filepath.Dir(other), 0o700)
	os.WriteFile(other, []byte(`{"countdown": 3, "queue": []}`), 0o600)
	a := testApp(t)
	var countdown Number
	a.wait(func() { countdown = a.cfg.Countdown })
	if countdown != 10 {
		t.Fatal("another program's settings were taken in:", countdown)
	}
	if msg := a.EraseAll(); msg != "" {
		t.Fatal(msg)
	}
	a.shutdown(nil)
	if _, err := os.Stat(other); err != nil {
		t.Fatal("another program's folder went:", err)
	}
	for _, dir := range erasable() {
		if strings.Contains(dir, "Open House Party") {
			t.Fatal("Erase All Data would delete", dir)
		}
	}
}
