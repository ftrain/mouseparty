package main

import (
	"errors"
	"flag"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

// Run a probe under the actual viewer launch policy, with no external network,
// window system, or MediaMTX installation needed. Test the namespace before
// the filter, so that one barrier can't mask the accidental loss of the other.
func TestLinuxViewerIsolation(t *testing.T) {
	if args := flag.Args(); len(args) == 3 && args[0] == "probe-site" {
		if c, err := net.DialTimeout("tcp4", args[1], time.Second); err == nil {
			c.Close()
			t.Fatal("reached unrelated host listener")
		}
		if _, err := os.ReadFile(args[2]); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("host file should be absent: %v", err)
		}
		if err := os.WriteFile("scratch", []byte("ok"), 0600); err != nil {
			t.Fatal(err)
		}
		if err := restrictSite(); err != nil {
			t.Fatal(err)
		}
		if _, err := net.DialTimeout("tcp4", args[1], time.Second); !errors.Is(err, syscall.EPERM) {
			t.Fatalf("expected socket denial: %v", err)
		}
		if err := exec.Command("/app/viewer", "-test.run=^$").Run(); !errors.Is(err, syscall.EPERM) {
			t.Fatalf("expected exec denial: %v", err)
		}
		return
	}
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Skip("needs bubblewrap")
	}
	l, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	secret := filepath.Join(t.TempDir(), "private")
	if err := os.WriteFile(secret, []byte("outside"), 0600); err != nil {
		t.Fatal(err)
	}
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	cmd, err := siteCommand(exe, 0, &SiteSetup{})
	if err != nil {
		t.Fatal(err)
	}
	defer cmd.ExtraFiles[0].Close()
	cmd.Args = append(cmd.Args[:len(cmd.Args)-1], "-test.run=^TestLinuxViewerIsolation$", "--", "probe-site", l.Addr().String(), secret)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("sandbox probe: %v\n%s", err, out)
	}
}

func TestLinuxViewerRequiresBubblewrap(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	if !siteSandboxing() {
		t.Fatal("missing bubblewrap selected the in-process site")
	}
	if _, err := siteCommand("unused", 0, &SiteSetup{}); !errors.Is(err, exec.ErrNotFound) {
		t.Fatalf("expected missing bubblewrap: %v", err)
	}
}
