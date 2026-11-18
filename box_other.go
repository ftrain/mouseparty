//go:build !darwin

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

type boxSpec struct {
	Read       []string  `json:"read,omitempty"`
	Write      []string  `json:"write,omitempty"`
	ConnectTCP []int     `json:"connectTCP,omitempty"`
	BindTCP    []int     `json:"bindTCP,omitempty"`
	UDP        bool      `json:"udp,omitempty"`
	Netlink    bool      `json:"netlink,omitempty"`
	Handles    []uintptr `json:"handles,omitempty"`
	Env        []string  `json:"env,omitempty"`
	App        int       `json:"app,omitempty"`
}

type box struct {
	bin  string
	spec boxSpec
}

func newBox(bin string) *box { return &box{bin: realPath(bin)} }

func (b *box) paths(to *[]string, paths []string) *box {
	for _, p := range paths {
		if p != "" {
			*to = append(*to, realPath(p))
		}
	}
	return b
}

func (b *box) read(paths ...string) *box { return b.paths(&b.spec.Read, paths) }

func (b *box) write(paths ...string) *box { return b.paths(&b.spec.Write, paths) }

func (b *box) lookups() *box {
	b.spec.UDP = true
	b.spec.ConnectTCP = append(b.spec.ConnectTCP, 53)
	return b.paths(&b.spec.Read, lookupReads)
}

func (b *box) fonts() *box {
	b.paths(&b.spec.Read, append(append([]string{}, fontReads...), cardFontFile()))
	if runtime.GOOS != "linux" {
		return b
	}
	if home, err := os.UserHomeDir(); err == nil {
		data := os.Getenv("XDG_DATA_HOME")
		if filepath.IsAbs(data) {
			b.spec.Env = append(b.spec.Env, "XDG_DATA_HOME="+data)
		} else {
			data = filepath.Join(home, ".local", "share")
		}
		b.read(filepath.Join(data, "fonts"), filepath.Join(home, ".fonts"))
	}
	if cache := cacheDir(); cache != "" {
		fontconfig := filepath.Join(cache, "fontconfig")
		if os.MkdirAll(filepath.Join(fontconfig, "fontconfig"), 0o700) == nil {
			b.write(fontconfig)
			b.spec.Env = append(b.spec.Env, "XDG_CACHE_HOME="+fontconfig)
		}
	}
	return b
}

func (b *box) reachLocal(ports ...int) *box {
	b.spec.ConnectTCP = append(b.spec.ConnectTCP, ports...)
	return b
}

func (b *box) reachOut(ports ...int) *box {
	b.spec.UDP = true
	b.spec.ConnectTCP = append(b.spec.ConnectTCP, ports...)
	return b
}

func (b *box) serveTCP(port int) *box {
	b.spec.BindTCP = append(b.spec.BindTCP, port)
	return b
}

func (b *box) serveIP(port int) *box {
	b.spec.UDP = true
	b.spec.BindTCP = append(b.spec.BindTCP, port)
	return b
}

func (b *box) serveLocal(ports ...int) *box {
	b.spec.BindTCP = append(b.spec.BindTCP, ports...)
	return b
}

func (b *box) udpOut() *box {
	b.spec.UDP = true
	return b
}

func (b *box) netlink() *box {
	b.spec.Netlink = true
	return b
}

func (b *box) inherit(handles ...uintptr) *box {
	b.spec.Handles = append(b.spec.Handles, handles...)
	return b
}

func (b *box) argv(args ...string) (string, []string) {
	if !sandboxing() {
		return b.bin, args
	}
	exe, _ := os.Executable()
	b.spec.App = os.Getpid()
	spec, _ := json.Marshal(b.spec)
	return exe, append([]string{boxArg, string(spec), "--", b.bin}, args...)
}
