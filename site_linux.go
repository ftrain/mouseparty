package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

// A request for a sandboxed Linux site is mandatory unless explicitly disabled.
// A missing bwrap, unavailable namespaces or a rejected filter must fail startup.
func siteSandboxing() bool { return !sandboxOff.Load() }

const siteFileSocket = syscall.SOCK_SEQPACKET // connected records, never a host datagram sender

func siteCommand(exe string, _ int, setup *SiteSetup) (*exec.Cmd, error) {
	mounts := []string{"--ro-bind", exe, "/app/viewer"}
	if setup.Pandoc != "" {
		mounts = append(mounts, "--ro-bind", setup.Pandoc, "/app/pandoc.wasm")
		setup.Pandoc = "/app/pandoc.wasm"
	}
	if setup.Python != "" {
		mounts = append(mounts, "--ro-bind", setup.Python, "/app/python")
		setup.Python = "/app/python"
	}
	setup.Tmp = "/tmp"
	cmd, err := bubblewrapCommand(context.Background(), "viewer", mounts, "/app/viewer", siteArg)
	if err != nil {
		return nil, err
	}
	parent, child, err := socketPair(syscall.SOCK_SEQPACKET)
	if err != nil {
		return nil, err
	}
	cmd.ExtraFiles = []*os.File{child} // fd 7; closed by launchSite even if bwrap fails
	go serveMediaDials(parent.(*net.UnixConn), setup.Ports)
	return cmd, nil
}

func mediaAddress(port int) string { return fmt.Sprintf("127.0.0.1:%d", port) }

// A one-byte request selects a service, never an address. Pass back an already
// connected socket. No viewer HTTP, SDP, or streaming data passes through the app.
func serveMediaDials(c *net.UnixConn, ports map[string]int) {
	defer c.Close()
	names := map[byte]string{'h': "hls", 'w': "webrtc"}
	var req [2]byte
	for {
		n, err := c.Read(req[:])
		if err != nil {
			return
		}
		name, ok := names[req[0]]
		if n != 1 || !ok {
			return
		}
		conn, err := net.DialTimeout("tcp4", mediaAddress(ports[name]), 3*time.Second)
		if err != nil {
			if _, err := c.Write([]byte{0}); err != nil {
				return
			}
			continue
		}
		f, err := conn.(*net.TCPConn).File()
		conn.Close()
		if err != nil {
			return
		}
		_, _, err = c.WriteMsgUnix([]byte{1}, syscall.UnixRights(int(f.Fd())), nil)
		f.Close()
		if err != nil {
			return
		}
	}
}

func configureSiteMedia(h *Host) error {
	f := os.NewFile(7, "media dials")
	conn, err := net.FileConn(f)
	f.Close()
	if err != nil {
		return err
	}
	c := conn.(*net.UnixConn)
	services := map[string]byte{mediaAddress(h.ports["hls"]): 'h', mediaAddress(h.ports["webrtc"]): 'w'}
	var mu sync.Mutex // pair each reply with the request that asked for it
	h.mediaTransport = &http.Transport{IdleConnTimeout: 90 * time.Second, DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
		service, ok := services[addr]
		if !ok || network != "tcp" {
			return nil, errors.New("not a viewer media port")
		}
		mu.Lock()
		defer mu.Unlock()
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if _, err := c.Write([]byte{service}); err != nil {
			return nil, err
		}
		var reply [1]byte
		oob := make([]byte, syscall.CmsgSpace(4))
		_, n, _, _, err := c.ReadMsgUnix(reply[:], oob)
		if err != nil {
			return nil, err
		}
		if reply[0] != 1 {
			return nil, errors.New("MediaMTX unavailable")
		}
		msgs, err := syscall.ParseSocketControlMessage(oob[:n])
		if err != nil || len(msgs) != 1 {
			return nil, errors.New("missing media socket")
		}
		fds, err := syscall.ParseUnixRights(&msgs[0])
		if err != nil || len(fds) != 1 {
			return nil, errors.New("invalid media socket")
		}
		stream := os.NewFile(uintptr(fds[0]), "media stream")
		defer stream.Close()
		return net.FileConn(stream)
	}}
	return nil
}
