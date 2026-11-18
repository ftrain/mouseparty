//go:build !darwin

package main

import (
	"bytes"
	"os"
	"path/filepath"
	"sync"

	"golang.org/x/image/font/gofont/gomono"
)

var extraToolDirs []string

func resourcesDir() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	if real, err := filepath.EvalSymlinks(exe); err == nil {
		exe = real
	}
	return filepath.Join(filepath.Dir(exe), "resources")
}

var (
	fontMu   sync.Mutex
	fontPath string
)

func cardFontFile() string {
	fontMu.Lock()
	defer fontMu.Unlock()
	if fontPath == "" || !plainFileAt(fontPath) {
		fontPath = findCardFont()
	}
	return fontPath
}

func findCardFont() string {
	var candidates []string
	if r := resourcesDir(); r != "" {
		candidates = append(candidates, filepath.Join(r, "fonts", "DejaVuSansMono.ttf"))
	}
	for _, p := range append(candidates, systemMonoFonts()...) {
		if plainFileAt(p) {
			return p
		}
	}
	return goMonoFile()
}

func goMonoFile() string {
	var dirs []string
	if d := cacheDir(); d != "" {
		dirs = append(dirs, d)
	}
	for _, d := range append(dirs, os.TempDir()) {
		p := filepath.Join(d, "GoMono.ttf")
		if b, err := os.ReadFile(p); err == nil && bytes.Equal(b, gomono.TTF) {
			return p
		}
		if os.MkdirAll(d, 0o700) == nil && replaceFile(p, gomono.TTF) == nil {
			return p
		}
	}
	return ""
}

func replaceFile(path string, b []byte) error {
	f, err := os.CreateTemp(filepath.Dir(path), ".mouseparty-*")
	if err != nil {
		return err
	}
	_, err = f.Write(b)
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		err = os.Rename(f.Name(), path)
	}
	if err != nil {
		os.Remove(f.Name())
	}
	return err
}

func plainFileAt(path string) bool {
	st, err := os.Stat(path)
	return err == nil && st.Mode().IsRegular()
}
