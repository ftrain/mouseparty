//go:build unix

package main

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"syscall"
)

// socketPair: two ends of a socket, for the app and the site
func socketPair(kind int) (ours net.Conn, theirs *os.File, err error) {
	syscall.ForkLock.RLock()
	fds, err := syscall.Socketpair(syscall.AF_UNIX, kind, 0)
	if err == nil {
		syscall.CloseOnExec(fds[0])
		syscall.CloseOnExec(fds[1])
	}
	syscall.ForkLock.RUnlock()
	if err != nil {
		return nil, nil, err
	}
	f := os.NewFile(uintptr(fds[0]), "site")
	ours, err = net.FileConn(f)
	f.Close()
	return ours, os.NewFile(uintptr(fds[1]), "site"), err
}

type siteLink struct {
	listening, siteIn, siteOut, siteFiles *os.File
	toSite, fromSite                      net.Conn
	files                                 *net.UnixConn
}

func takeSitePort(port int) (net.Listener, error) {
	return net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", port))
}

func newSiteLink(l net.Listener) (*siteLink, error) {
	k := &siteLink{}
	var err error
	if k.listening, err = l.(*net.TCPListener).File(); err != nil {
		return nil, err
	}
	if k.toSite, k.siteIn, err = socketPair(syscall.SOCK_STREAM); err != nil {
		k.closeTheirs()
		return nil, err
	}
	if k.fromSite, k.siteOut, err = socketPair(syscall.SOCK_STREAM); err != nil {
		k.closeTheirs()
		k.closeOurs()
		return nil, err
	}
	var files net.Conn
	if files, k.siteFiles, err = socketPair(syscall.SOCK_DGRAM); err != nil {
		k.closeTheirs()
		k.closeOurs()
		return nil, err
	}
	k.files = files.(*net.UnixConn)
	return k, nil
}

func (k *siteLink) theirs() []*os.File {
	return []*os.File{k.listening, k.siteIn, k.siteOut, k.siteFiles}
}

func (k *siteLink) give(b *box) {
	for i := range k.theirs() {
		b.inherit(uintptr(3 + i))
	}
}

func (k *siteLink) attach(cmd *exec.Cmd) {
	cmd.ExtraFiles = k.theirs() // 3, 4, 5, 6 there (siteMain)
}

func (k *siteLink) closeTheirs() {
	for _, f := range k.theirs() {
		if f != nil {
			f.Close()
		}
	}
}

func (k *siteLink) closeOurs() {
	for _, c := range []net.Conn{k.toSite, k.fromSite} {
		if c != nil {
			c.Close()
		}
	}
	if k.files != nil {
		k.files.Close()
	}
}

func (k *siteLink) started(*siteProc) error { return nil }

func (k *siteLink) send(t *SiteTell, f *os.File) bool {
	_, _, err := k.files.WriteMsgUnix([]byte(t.Doc.Token), syscall.UnixRights(int(f.Fd())), nil)
	return err == nil
}

func siteEnds() (net.Listener, net.Conn, net.Conn, *net.UnixConn, error) {
	conn := func(fd uintptr) (net.Conn, error) {
		f := os.NewFile(fd, "app")
		defer f.Close()
		return net.FileConn(f)
	}
	listening := os.NewFile(3, "site")
	l, err := net.FileListener(listening)
	listening.Close()
	if err != nil {
		return nil, nil, nil, nil, err
	}
	var c [3]net.Conn
	for i := range c {
		if c[i], err = conn(uintptr(4 + i)); err != nil {
			return nil, nil, nil, nil, err
		}
	}
	files, ok := c[2].(*net.UnixConn)
	if !ok {
		return nil, nil, nil, nil, fmt.Errorf("fd 6 isn't a socket")
	}
	return l, c[0], c[1], files, nil
}

// takeFiles: each document's file arrives open, named by the document's token
func (s *siteSide) takeFiles(c *net.UnixConn) {
	name, oob := make([]byte, 256), make([]byte, syscall.CmsgSpace(4*4))
	for {
		n, oobn, _, _, err := c.ReadMsgUnix(name, oob)
		if err != nil {
			return
		}
		msgs, _ := syscall.ParseSocketControlMessage(oob[:oobn])
		for _, m := range msgs {
			fds, _ := syscall.ParseUnixRights(&m)
			for _, fd := range fds {
				syscall.CloseOnExec(fd)
				s.mu.Lock()
				if old := s.handed[string(name[:n])]; old != nil {
					old.Close()
				}
				s.handed[string(name[:n])] = os.NewFile(uintptr(fd), "document")
				s.mu.Unlock()
			}
		}
	}
}

func (s *siteSide) received(t SiteTell) *os.File { return s.file(t.Doc.Token) }

func holdCanary(string) {}

func canaryReached(path string) bool {
	_, err := os.ReadFile(path)
	return err == nil
}
