//go:build unix

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

// MediaMTX and cloudflared are started under this, so they stop when the app
// does, even if the app is killed or crashes: the app holds the write end of
// their stdin; when it goes, the watcher's read ends and it stops the tool. (A
// shell gives background jobs /dev/null for stdin, hence the explicit fd 3.)
const watchdog = `exec 3<&0; "$@" 3<&- & child=$!; (read _ <&3; kill $child 2>/dev/null) & watcher=$!; ` +
	`exec 3<&-; wait $child; code=$?; kill $watcher 2>/dev/null; exit $code`

const watchName = "mouseparty-watch"

func procAttr(cmd *exec.Cmd) *syscall.SysProcAttr {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	return cmd.SysProcAttr
}

func watched(run string, argv []string) *exec.Cmd {
	cmd := exec.Command("/bin/sh", append([]string{"-c", watchdog, watchName, run}, argv...)...)
	startGroup(cmd)
	return cmd
}

func startGroup(cmd *exec.Cmd) { procAttr(cmd).Setpgid = true }

func detach(cmd *exec.Cmd) { procAttr(cmd).Setpgid = true }

func noConsole(*exec.Cmd) {}

func interruptGroup(cmd *exec.Cmd) { syscall.Kill(-cmd.Process.Pid, syscall.SIGINT) }

func killGroup(cmd *exec.Cmd) { syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }

func killBoxed(cmd *exec.Cmd) { cmd.Process.Kill() }

// stopGroup stops a watched tool and its watcher: they share a process group
func stopGroup(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	pid := cmd.Process.Pid
	if syscall.Kill(-pid, syscall.SIGTERM) != nil {
		return
	}
	for end := time.Now().Add(5 * time.Second); time.Now().Before(end); time.Sleep(100 * time.Millisecond) {
		if syscall.Kill(-pid, 0) != nil {
			return
		}
	}
	syscall.Kill(-pid, syscall.SIGKILL)
}

// killLeftovers: a session that crashed or was force-quit leaves MediaMTX (and
// cloudflared) running, holding the ports. Ours are recognisable: MediaMTX runs a
// mouseparty-host-* config, cloudflared tunnels to our port. Only orphans go; a live
// session's belong to its app, which may be another copy of this one, or a self-test
// running beside it.
func (h *Host) killLeftovers() {
	h.stopLeftovers()
	time.Sleep(300 * time.Millisecond)
	// and the folders crashed sessions left (their config; never a key), unless something still uses them
	dirs, _ := filepath.Glob(filepath.Join(os.TempDir(), "mouseparty-host-*"))
	for _, d := range dirs {
		if lock := takeSession(d); lock != nil {
			os.RemoveAll(d)
			lock.Close()
		}
	}
}

func (h *Host) stopLeftovers() {
	column := "pgid="
	if runtime.GOOS == "darwin" {
		column = "ppid="
	}
	out, err := exec.Command("ps", "-axo", "pid=,"+column+",command=").Output()
	if err != nil {
		return
	}
	lines := strings.Split(string(out), "\n")
	running := map[string]bool{}
	for _, line := range lines {
		if f := strings.Fields(line); len(f) > 0 {
			running[f[0]] = true
		}
	}
	origin := tunnelOrigin(h.HTTPPort)
	for _, line := range lines {
		f := strings.Fields(line)
		if len(f) < 3 {
			continue
		}
		pid, above, cmd := f[0], f[1], strings.Join(f[2:], " ")
		orphan := above != pid && above != "0" && !running[above]
		tunnel := strings.Contains(cmd, "cloudflared") && strings.Contains(" "+cmd+" ", " --url "+origin+" ")
		if runtime.GOOS == "darwin" {
			orphan = above == "1"
			tunnel = strings.Contains(cmd, "cloudflared") && strings.HasSuffix(cmd, "tunnel --no-autoupdate --url "+origin)
		}
		mediamtx := strings.Contains(cmd, "mediamtx") && strings.Contains(cmd, "/mouseparty-host-") && strings.HasSuffix(cmd, "mediamtx.yml")
		if orphan && (mediamtx || tunnel) {
			h.Log("Stopping a leftover from an earlier session: " + filepath.Base(f[2]))
			var n int
			fmt.Sscan(pid, &n)
			syscall.Kill(n, syscall.SIGTERM)
		}
	}
}

func holdSession(dir string) (*os.File, error) {
	f, err := os.CreateTemp(dir, sessionLock)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, err
	}
	if err := os.Rename(f.Name(), filepath.Join(dir, sessionLock)); err != nil {
		f.Close()
		return nil, err
	}
	return f, nil
}

func takeSession(dir string) *os.File {
	if st, err := os.Lstat(dir); err != nil || !st.IsDir() || !ownedByUs(st) {
		return nil
	}
	f, err := os.OpenFile(filepath.Join(dir, sessionLock), os.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil
	}
	if st, err := f.Stat(); err != nil || !st.Mode().IsRegular() || syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB) != nil {
		f.Close()
		return nil
	}
	return f
}

func ownedByUs(st os.FileInfo) bool {
	s, ok := st.Sys().(*syscall.Stat_t)
	return ok && int(s.Uid) == os.Getuid()
}

func adopt(*exec.Cmd) {}

func waitGone(pid int) {
	for syscall.Kill(pid, 0) == nil {
		time.Sleep(200 * time.Millisecond)
	}
}
