package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

// Finder launches apps with a bare PATH; Homebrew and MacPorts live here.
var extraToolDirs = []string{"/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"}

// bundledBin is where the built app keeps ffmpeg, MediaMTX and cloudflared:
// TubeYap.app/Contents/Resources/bin (scripts/build_mac_app.sh puts them there).
func bundledBin() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Join(filepath.Dir(exe), "..", "Resources", "bin")
}

// setToolPath puts the bundled tools first on PATH and the usual macOS tool
// directories last, for every tool this app runs.
func setToolPath() {
	parts := filepath.SplitList(os.Getenv("PATH"))
	if bin := bundledBin(); bin != "" {
		if st, err := os.Stat(bin); err == nil && st.IsDir() && !slices.Contains(parts, bin) {
			parts = append([]string{bin}, parts...)
		}
	}
	for _, d := range extraToolDirs {
		if st, err := os.Stat(d); err == nil && st.IsDir() && !slices.Contains(parts, d) {
			parts = append(parts, d)
		}
	}
	os.Setenv("PATH", strings.Join(parts, string(os.PathListSeparator)))
}

func findTool(name string) string {
	p, err := exec.LookPath(name)
	if err != nil {
		return ""
	}
	return p
}

// firstTool: the tool's full path, or its bare name for exec to report as missing
func firstTool(name string) string {
	if p := findTool(name); p != "" {
		return p
	}
	return name
}

func contextTimeout(d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), d)
}
