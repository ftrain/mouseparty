package main

import (
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"slices"
	"strconv"
	"strings"
	"sync"

	"golang.org/x/sys/windows"
)

const siteHandles = "MOUSEPARTY_SITE"

type pipes struct{ r, w *os.File }

func (p pipes) Read(b []byte) (int, error)  { return p.r.Read(b) }
func (p pipes) Write(b []byte) (int, error) { return p.w.Write(b) }
func (p pipes) Close() error                { return errors.Join(p.r.Close(), p.w.Close()) }

type sitePort struct{ port int }

func (p sitePort) Accept() (net.Conn, error) { return nil, errors.New("the site takes its own port") }
func (p sitePort) Close() error              { return nil }
func (p sitePort) Addr() net.Addr            { return &net.TCPAddr{IP: net.IPv4zero, Port: p.port} }

func takeSitePort(port int) (net.Listener, error) {
	l, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", port))
	if err != nil {
		return nil, err
	}
	l.Close()
	return sitePort{port}, nil
}

type siteLink struct {
	toSite, fromSite io.ReadWriteCloser
	theirs           []*os.File
	mu               sync.Mutex
	site             windows.Handle
}

func newSiteLink(net.Listener) (*siteLink, error) {
	var ends []*os.File
	for range 4 {
		r, w, err := os.Pipe()
		if err != nil {
			for _, f := range ends {
				f.Close()
			}
			return nil, err
		}
		ends = append(ends, r, w)
	}
	k := &siteLink{
		toSite:   pipes{r: ends[2], w: ends[1]},
		fromSite: pipes{r: ends[4], w: ends[7]},
		theirs:   []*os.File{ends[0], ends[3], ends[6], ends[5]},
	}
	for _, f := range ends {
		inherit := uint32(0)
		if slices.Contains(k.theirs, f) {
			inherit = windows.HANDLE_FLAG_INHERIT
		}
		if err := windows.SetHandleInformation(windows.Handle(f.Fd()), windows.HANDLE_FLAG_INHERIT, inherit); err != nil {
			k.closeTheirs()
			k.closeOurs()
			return nil, err
		}
	}
	return k, nil
}

func (k *siteLink) handles() []uintptr {
	h := make([]uintptr, len(k.theirs))
	for i, f := range k.theirs {
		h[i] = f.Fd()
	}
	return h
}

func (k *siteLink) give(b *box) { b.inherit(k.handles()...) }

func (k *siteLink) attach(cmd *exec.Cmd) {
	var values []string
	for _, h := range k.handles() {
		procAttr(cmd).AdditionalInheritedHandles = append(procAttr(cmd).AdditionalInheritedHandles, syscallHandle(h))
		values = append(values, strconv.FormatUint(uint64(h), 10))
	}
	if cmd.Env == nil {
		cmd.Env = os.Environ()
	}
	cmd.Env = append(cmd.Env, siteHandles+"="+strings.Join(values, ","))
}

func (k *siteLink) closeTheirs() {
	for _, f := range k.theirs {
		f.Close()
	}
}

func (k *siteLink) closeOurs() {
	k.toSite.Close()
	k.fromSite.Close()
	k.mu.Lock()
	if k.site != 0 {
		windows.CloseHandle(k.site)
		k.site = 0
	}
	k.mu.Unlock()
}

func (k *siteLink) started(s *siteProc) error {
	var p SitePid
	if err := s.ask("Site.Pid", None{}, &p); err != nil {
		return err
	}
	h, err := windows.OpenProcess(windows.PROCESS_DUP_HANDLE|windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(p.Pid))
	if err != nil {
		return fmt.Errorf("its process: %w", err)
	}
	if !startedBy(s.cmd, h) {
		windows.CloseHandle(h)
		return errors.New("it isn't the process the app started")
	}
	k.mu.Lock()
	if k.site != 0 {
		windows.CloseHandle(k.site)
	}
	k.site = h
	k.mu.Unlock()
	return nil
}

func (k *siteLink) send(t *SiteTell, f *os.File) bool {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.site == 0 {
		return false
	}
	var h windows.Handle
	if windows.DuplicateHandle(windows.CurrentProcess(), windows.Handle(f.Fd()), k.site, &h, 0, false,
		windows.DUPLICATE_SAME_ACCESS) != nil {
		return false
	}
	t.Handle = uint64(h)
	return true
}

type noFiles struct{}

func siteEnds() (net.Listener, io.ReadWriteCloser, io.ReadWriteCloser, noFiles, error) {
	parts := strings.Split(os.Getenv(siteHandles), ",")
	os.Unsetenv(siteHandles)
	if len(parts) != 4 {
		return nil, nil, nil, noFiles{}, errors.New("no handles from the app")
	}
	var f [4]*os.File
	for i, p := range parts {
		h, err := strconv.ParseUint(p, 10, 64)
		if err != nil || h == 0 {
			return nil, nil, nil, noFiles{}, fmt.Errorf("not a handle: %q", p)
		}
		f[i] = os.NewFile(uintptr(h), "app")
	}
	return nil, pipes{r: f[0], w: f[1]}, pipes{r: f[2], w: f[3]}, noFiles{}, nil
}

func (s *siteSide) takeFiles(noFiles) {}

func (s *siteSide) received(t SiteTell) *os.File {
	if t.Handle == 0 {
		return nil
	}
	return os.NewFile(uintptr(t.Handle), "document")
}

func siteLocked() error { return nil }

func holdCanary(path string) { labelPath(path, mediumIntegrityLabel) }

func canaryReached(path string) bool {
	f, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err == nil {
		f.Close()
	}
	return err == nil
}
