package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// On the Mac, what Erase All Data can't delete is said in its sheet, and the app doesn't quit
func TestEraseAllSaysWhatItCannotDelete(t *testing.T) {
	tempHome(t)
	a := testApp(t)
	held := filepath.Join(dataDir(), "held", "file")
	os.MkdirAll(filepath.Dir(held), 0o700)
	os.WriteFile(held, []byte("x"), 0o600)
	if !hold(t, held) {
		t.Skip("needs a folder its owner can't delete from")
	}
	msg := a.EraseAll()
	if !strings.Contains(msg, "held") {
		t.Fatal("not said:", msg)
	}
	if said := a.LogText(); strings.Contains(said, "is erased") {
		t.Fatal(said)
	}
	if _, err := os.Stat(partyPath()); !os.IsNotExist(err) {
		t.Fatal("the party file is still there")
	}
}
