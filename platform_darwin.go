package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// Finder launches apps with a bare PATH; Homebrew and MacPorts live here.
var extraToolDirs = []string{"/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"}

func resourcesDir() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Join(filepath.Dir(exe), "..", "Resources")
}

// dataDir: everything the app keeps, ~/Library/Application Support/Mouse Party
func dataDir() string {
	dir, _ := os.UserConfigDir()
	return filepath.Join(dir, "Mouse Party")
}

func webviewFolders() []string {
	const id = "io.github.ftrain.mouseparty"
	home, _ := os.UserHomeDir()
	lib := filepath.Join(home, "Library")
	var paths []string
	for _, p := range []string{"WebKit/" + id, "Caches/" + id, "HTTPStorages/" + id, "HTTPStorages/" + id + ".binarycookies",
		"Saved Application State/" + id + ".savedState"} {
		paths = append(paths, filepath.Join(lib, p))
	}
	return paths
}

func cardFontFile() string { return "/System/Library/Fonts/Menlo.ttc" }

func cardFontRef() (dir, file string) { return "", cardFontFile() }

func hiddenFile(d fs.DirEntry) bool { return strings.HasPrefix(d.Name(), ".") }

func playingKey(path string) string { return path }

func toolHint(name string) string { return "brew install " + name }

func thenProgram() (string, error) { return os.Executable() }

func exeReplaced() bool { return false }

func unpacker() int { return 0 }

func closeInheritedFiles() {}

func eraseKey(string) error { return nil }

func zoneMark(string) func(string) { return func(string) {} }
