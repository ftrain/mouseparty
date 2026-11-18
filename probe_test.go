package main

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"os"
	"os/exec"
	"syscall"
	"testing"
	"time"
)

const probeArg = "--probe"

const (
	probeDid     = 0
	probeRefused = 3
	probeFailed  = 4
	probeUsage   = 5
)

type probeOp struct {
	args int
	do   func(args []string) error
}

var probeOps = map[string]probeOp{
	"read":  {1, func(a []string) error { _, err := os.ReadFile(a[0]); return err }},
	"list":  {1, probeList},
	"write": {1, probeWrite},
	"times": {1, probeTimes},
	"chmod": {1, probeChmod},
	"chown": {1, func(a []string) error { return os.Chown(a[0], os.Getuid(), os.Getgid()) }},
	"exec":  {1, probeExec},
	"dial":  {1, func(a []string) error { return closed(net.DialTimeout("tcp", a[0], 3*time.Second)) }},
	"wait":  {0, probeWait},
}

var asSubreaper = func(*testing.T) {}

func probeMain(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: --probe <op> [args...]")
		return probeUsage
	}
	op, ok := probeOps[args[0]]
	if !ok || len(args)-1 < op.args {
		fmt.Fprintln(os.Stderr, "the probe has no", args[0], "taking", len(args)-1)
		return probeUsage
	}
	err := op.do(args[1:])
	if err == nil {
		return probeDid
	}
	fmt.Fprintln(os.Stderr, args[0]+":", err)
	if refusal(err) {
		return probeRefused
	}
	return probeFailed
}

func refusal(err error) bool {
	var errno syscall.Errno
	if errors.As(err, &errno) {
		switch errno {
		case syscall.EAFNOSUPPORT, syscall.EPROTONOSUPPORT, syscall.ENOSYS:
			return true
		}
	}
	return errors.Is(err, fs.ErrPermission)
}

func closed[T interface{ Close() error }](c T, err error) error {
	if err == nil {
		c.Close()
	}
	return err
}

func probeList(a []string) error {
	f, err := os.Open(a[0])
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := f.ReadDir(1); err != nil && err != io.EOF {
		return err
	}
	return nil
}

func probeWrite(a []string) error {
	f, err := os.OpenFile(a[0], os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0o600)
	if err != nil {
		return err
	}
	return f.Close()
}

func probeTimes(a []string) error {
	st, err := os.Stat(a[0])
	if err != nil {
		return err
	}
	return os.Chtimes(a[0], st.ModTime(), st.ModTime())
}

func probeChmod(a []string) error {
	st, err := os.Stat(a[0])
	if err != nil {
		return err
	}
	return os.Chmod(a[0], st.Mode())
}

func probeWait([]string) error {
	fmt.Println("waiting")
	time.Sleep(5 * time.Minute)
	return nil
}

func probeExec(a []string) error {
	var exit *exec.ExitError
	if err := exec.Command(a[0], a[1:]...).Run(); err != nil && !errors.As(err, &exit) {
		return err
	}
	return nil
}
