package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

const (
	thenArg      = "--then"
	registryRoot = `HKCU\`
)

func then(open string, paths ...string) {
	exe, err := thenProgram()
	if err != nil {
		return
	}
	waits := []string{strconv.Itoa(os.Getpid())}
	if unpackedAppImage(open) {
		if pid := unpacker(); pid > 0 {
			waits = append(waits, strconv.Itoa(pid))
		}
	}
	cmd := exec.Command(exe, append([]string{thenArg, strings.Join(waits, ","), open}, paths...)...)
	detach(cmd)
	cmd.Start()
}

func thenMain(args []string) int {
	if len(args) < 2 {
		return 2
	}
	var pids []int
	for _, field := range strings.Split(args[0], ",") {
		pid, err := strconv.Atoi(field)
		if err != nil {
			return 2
		}
		pids = append(pids, pid)
	}
	unpacked := unpackedAppImage(args[1])
	for _, pid := range pids {
		waitGone(pid)
	}
	var left []string
	for _, p := range args[2:] {
		if filepath.IsAbs(p) || strings.HasPrefix(p, registryRoot) {
			left = append(left, p)
		}
	}
	for end := time.Now().Add(15 * time.Second); len(left) > 0 && time.Now().Before(end); time.Sleep(250 * time.Millisecond) {
		left = slices.DeleteFunc(left, func(p string) bool { return eraseOne(p) == nil })
	}
	if args[1] != "" {
		closeInheritedFiles()
		cmd := exec.Command(args[1])
		cmd.Env = os.Environ()
		if bin := bundledBin(); bin != "" {
			dirs := filepath.SplitList(os.Getenv("PATH"))
			if rest := slices.DeleteFunc(slices.Clone(dirs), func(d string) bool { return d == bin }); len(rest) < len(dirs) {
				cmd.Env = append(cmd.Env, "PATH="+strings.Join(rest, string(os.PathListSeparator)))
			}
		}
		if unpacked {
			cmd.Env = append(cmd.Env, "APPIMAGE_EXTRACT_AND_RUN=1")
		}
		detach(cmd)
		if cmd.Start() != nil {
			return 1
		}
	}
	return 0
}

func unpackedAppImage(open string) bool {
	if !strings.HasPrefix(filepath.Base(os.Getenv("APPDIR")), "appimage_extracted_") {
		return false
	}
	a, err := os.Stat(open)
	if err != nil {
		return false
	}
	b, err := os.Stat(os.Getenv("APPIMAGE"))
	return err == nil && os.SameFile(a, b)
}

func eraseOne(p string) error {
	if key, ok := strings.CutPrefix(p, registryRoot); ok {
		return eraseKey(key)
	}
	return os.RemoveAll(p)
}

var classID = regexp.MustCompile(`^\{[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\}$`)

func ownKey(path string) bool {
	parts := strings.Split(strings.Trim(path, `\`), `\`)
	last := parts[len(parts)-1]
	return len(parts) >= 2 && (strings.Contains(strings.ToLower(last), "mouseparty") || classID.MatchString(last))
}
