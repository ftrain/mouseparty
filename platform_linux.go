package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

func xdgDataHome() string {
	if dir := os.Getenv("XDG_DATA_HOME"); filepath.IsAbs(dir) {
		return dir
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".local", "share")
}

func dataDir() string { return filepath.Join(xdgDataHome(), "Mouse Party") }

func systemMonoFonts() []string {
	return []string{
		"/usr/share/fonts/dejavu-sans-mono-fonts/DejaVuSansMono.ttf",
		"/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
		"/usr/share/fonts/TTF/DejaVuSansMono.ttf",
		"/usr/share/fonts/dejavu/DejaVuSansMono.ttf",
	}
}

func cardFontRef() (dir, file string) { return "", cardFontFile() }

func hiddenFile(d fs.DirEntry) bool { return strings.HasPrefix(d.Name(), ".") }

func playingKey(path string) string { return path }

func toolHint(string) string { return "reinstall Mouse Party" }

func relaunchTarget() string {
	exe, _ := os.Executable()
	if image := appImageOf(exe); image != "" {
		return image
	}
	return exe
}

func ownProgramName(name string) bool {
	return name == "mouseparty" || name == "MouseParty" || strings.HasSuffix(strings.ToLower(name), ".appimage")
}

func webviewFolders() []string {
	names := []string{appID}
	if n := filepath.Base(os.Args[0]); ownProgramName(n) {
		names = append(names, n)
	}
	var bases []string
	bases = append(bases, xdgDataHome())
	if d, err := os.UserCacheDir(); err == nil {
		bases = append(bases, d)
	}
	var dirs []string
	for _, base := range bases {
		for _, n := range names {
			dirs = append(dirs, filepath.Join(base, n))
		}
	}
	if exe, err := os.Executable(); err == nil {
		if n := filepath.Base(exe); ownProgramName(n) {
			if d, err := os.UserConfigDir(); err == nil {
				dirs = append(dirs, filepath.Join(d, n))
			}
		}
	}
	return dirs
}

func thenProgram() (string, error) { return "/proc/self/exe", nil }

func exeReplaced() bool {
	exe, err := os.Readlink("/proc/self/exe")
	return err == nil && strings.HasSuffix(exe, " (deleted)")
}

func unpacker() int {
	ppid := os.Getppid()
	a, err := os.Stat(filepath.Join("/proc", strconv.Itoa(ppid), "exe"))
	if err != nil {
		return 0
	}
	b, err := os.Stat(os.Getenv("APPIMAGE"))
	if err != nil || !os.SameFile(a, b) {
		return 0
	}
	return ppid
}

func closeInheritedFiles() {
	entries, err := os.ReadDir("/proc/self/fd")
	if err != nil {
		return
	}
	for _, e := range entries {
		if fd, err := strconv.Atoi(e.Name()); err == nil && fd > 2 {
			syscall.CloseOnExec(fd)
		}
	}
}

func eraseKey(string) error { return nil }

func zoneMark(string) func(string) { return func(string) {} }
