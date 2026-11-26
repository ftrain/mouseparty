// signrelease: signs a release's app files with Mouse Party's release key (minisign), each
// <file>.minisig beside it, then checks each against the public key built into the app, so a
// release never goes out signed with some other key. The key is MINISIGN_KEY (minisign's
// encrypted secret key file, as text) and MINISIGN_PASSWORD, from the environment.
//
//	go run ./tools/signrelease <version> <file>...   (.github/workflows/app.yml's release jobs)
//	go run ./tools/signrelease -new <dir>            a new key pair: <dir>/mouseparty.key (encrypted),
//	                                                 <dir>/mouseparty.password, <dir>/mouseparty.pub
package main

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"aead.dev/minisign"

	"github.com/ftrain/mouseparty/internal/releasesig"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "signrelease:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 2 && args[0] == "-new" {
		return newKey(args[1])
	}
	if len(args) < 2 {
		return fmt.Errorf("usage: signrelease <version> <file>... | -new <dir>")
	}
	version := strings.TrimPrefix(args[0], "v")
	text, password := os.Getenv("MINISIGN_KEY"), os.Getenv("MINISIGN_PASSWORD")
	if text == "" || password == "" {
		return fmt.Errorf("MINISIGN_KEY and MINISIGN_PASSWORD aren't set (the repo's secrets): a release isn't published unsigned")
	}
	key, err := minisign.DecryptKey(password, []byte(text))
	if err != nil {
		return fmt.Errorf("the release key doesn't open: %v", err)
	}
	for _, path := range args[1:] {
		asset := filepath.Base(path)
		sig, err := releasesig.Sign(key, path, version, asset)
		if err != nil {
			return err
		}
		if err := os.WriteFile(path+".minisig", sig, 0o644); err != nil {
			return err
		}
		if err := releasesig.Check(releasesig.PublicKey, path, sig, version, asset); err != nil {
			return fmt.Errorf("%s: %v (is MINISIGN_KEY the key whose public half is in internal/releasesig?)", asset, err)
		}
		fmt.Println("signed", asset)
	}
	return nil
}

func newKey(dir string) error {
	pub, priv, err := minisign.GenerateKey(rand.Reader)
	if err != nil {
		return err
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return err
	}
	password := base64.RawURLEncoding.EncodeToString(b)
	sealed, err := minisign.EncryptKey(password, priv)
	if err != nil {
		return err
	}
	pubText, err := pub.MarshalText()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	for name, data := range map[string][]byte{"mouseparty.key": sealed, "mouseparty.password": []byte(password + "\n")} {
		f, err := os.OpenFile(filepath.Join(dir, name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if err != nil {
			return err
		}
		_, err = f.Write(data)
		if cerr := f.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			return err
		}
	}
	if err := os.WriteFile(filepath.Join(dir, "mouseparty.pub"), append(pubText, '\n'), 0o644); err != nil {
		return err
	}
	fmt.Println(string(pubText))
	return nil
}
