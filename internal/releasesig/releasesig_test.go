package releasesig

import (
	"crypto/rand"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"aead.dev/minisign"
)

func TestPublicKeyReads(t *testing.T) {
	var pub minisign.PublicKey
	if err := pub.UnmarshalText([]byte(PublicKey)); err != nil {
		t.Fatalf("the release key built in doesn't read: %v", err)
	}
}

func TestCheck(t *testing.T) {
	pub, priv, err := minisign.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	pubText, _ := pub.MarshalText()
	key := string(pubText)
	_, other, _ := minisign.GenerateKey(rand.Reader)

	dir := t.TempDir()
	file := filepath.Join(dir, "MouseParty-windows-x86_64-setup.exe")
	if err := os.WriteFile(file, []byte("the installer"), 0o644); err != nil {
		t.Fatal(err)
	}
	good, err := Sign(priv, file, "3.6.0", filepath.Base(file))
	if err != nil {
		t.Fatal(err)
	}
	if err := Check(key, file, good, "3.6.0", filepath.Base(file)); err != nil {
		t.Fatalf("a good signature: %v", err)
	}

	byOther, _ := Sign(other, file, "3.6.0", filepath.Base(file))
	older, _ := Sign(priv, file, "3.5.1", filepath.Base(file))
	otherFile, _ := Sign(priv, file, "3.6.0", "MouseParty-linux-x86_64.AppImage")
	plain := minisign.Sign(priv, []byte("the installer")) // not prehashed: not what releases have
	for name, c := range map[string]struct {
		sig  []byte
		want string
	}{
		"another key":           {byOther, "isn't signed with"},
		"an older version":      {older, "signed as"},
		"another file":          {otherFile, "signed as"},
		"not prehashed":         {plain, "isn't of the kind"},
		"no signature":          {nil, "doesn't read"},
		"the comment rewritten": {[]byte(strings.Replace(string(good), "3.6.0", "3.7.0", 1)), "isn't signed with"},
	} {
		err := Check(key, file, c.sig, "3.6.0", filepath.Base(file))
		if err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: got %v, want an error with %q", name, err, c.want)
		}
	}

	if err := os.WriteFile(file, []byte("the installer, changed"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Check(key, file, good, "3.6.0", filepath.Base(file)); err == nil {
		t.Error("a changed file passed")
	}
}
