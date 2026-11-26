// Package releasesig: the minisign signature a release's Linux and Windows files carry
// (<file>.minisig beside each), made by .github/workflows/app.yml's release-linux-windows job
// with the repo's MINISIGN_KEY and checked by those apps before an update goes anywhere
// (updates_other.go). The Mac's updates are held to its Developer ID instead (checkBundle). GitHub's SHA-256 only
// says a file is the one uploaded; this says Mouse Party's own release key made it, for that
// version and that file, so whoever can upload to a release can't hand anyone an update.
package releasesig

import (
	"errors"
	"fmt"
	"io"
	"os"

	"aead.dev/minisign"
)

// PublicKey: the release key's public half. Its private half is MINISIGN_KEY (and
// MINISIGN_PASSWORD) in the repo's secrets; `go run ./tools/signrelease -new <dir>` makes a pair.
const PublicKey = "RWSlUiLfYZdI3lW8KVVwPZ9f+b9/k3oG8plwCYwIaNfVuv5/RoN6TodZ" // key ID DE489761DF2252A5

// SigMax: a signature file is a few hundred bytes
const SigMax = 4 << 10

// Comment: the signed (trusted) comment, which ties a signature to one version's one file,
// so an older release's file can't be passed off as a newer one's
func Comment(version, asset string) string {
	return fmt.Sprintf("Mouse Party %s %s", version, asset)
}

// Check: the file at path is the one the key signed as version's asset; nil, or why not
func Check(key, path string, sig []byte, version, asset string) error {
	var pub minisign.PublicKey
	if err := pub.UnmarshalText([]byte(key)); err != nil {
		return errors.New("this Mouse Party's release key doesn't read")
	}
	var s minisign.Signature
	if err := s.UnmarshalText(sig); err != nil {
		return errors.New("its signature doesn't read")
	}
	if s.Algorithm != minisign.HashEdDSA {
		return errors.New("its signature isn't of the kind releases have")
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	r := minisign.NewReader(f)
	if _, err := io.Copy(io.Discard, r); err != nil {
		return err
	}
	if !r.Verify(pub, sig) {
		return errors.New("it isn't signed with Mouse Party's release key")
	}
	if want := Comment(version, asset); s.TrustedComment != want {
		return fmt.Errorf("it's signed as %q, not %q", s.TrustedComment, want)
	}
	return nil
}

// Sign: the signature of the file at path as version's asset
func Sign(key minisign.PrivateKey, path, version, asset string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	r := minisign.NewReader(f)
	if _, err := io.Copy(io.Discard, r); err != nil {
		return nil, err
	}
	return r.SignWithComments(key, Comment(version, asset), "Mouse Party release key"), nil
}
