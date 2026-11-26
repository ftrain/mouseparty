//go:build !darwin

package main

import (
	"os"
	"path/filepath"
	"strings"
)

const appID = "io.github.ftrain.mouseparty"

func (a *App) openArgs(dir string, args []string) {
	for _, p := range args {
		if p == "" || strings.HasPrefix(p, "-") {
			continue
		}
		if !filepath.IsAbs(p) && dir != "" {
			p = filepath.Join(dir, p)
		}
		if st, err := os.Stat(p); err == nil && (st.Mode().IsRegular() || st.IsDir()) {
			a.openFile(filepath.Clean(p))
		}
	}
}
