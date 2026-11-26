package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

const (
	fakeToolEnv = "MOUSEPARTY_FAKE_TOOL"
	fakeDirEnv  = "MOUSEPARTY_FAKE_DIR"
	fakeRealEnv = "MOUSEPARTY_FAKE_REAL"
)

var fakeTools = map[string]func(args []string) int{
	"cloudflared": fakeCloudflared,
	"mediamtx":    fakeMediaMTX,
}

func fakeToolMain(tool string, args []string) int {
	run, ok := fakeTools[tool]
	if !ok {
		fmt.Fprintln(os.Stderr, "no stand-in called", tool)
		return 2
	}
	return run(args)
}

func fakeTool(t *testing.T, name string) (string, string) {
	t.Helper()
	if fakeTools[name] == nil {
		t.Fatalf("no stand-in called %s", name)
	}
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	t.Setenv(fakeToolEnv, name)
	t.Setenv(fakeDirEnv, dir)
	return exe, dir
}

func fakeCount(name string) int {
	path := filepath.Join(os.Getenv(fakeDirEnv), name)
	b, _ := os.ReadFile(path)
	n, _ := strconv.Atoi(strings.TrimSpace(string(b)))
	n++
	os.WriteFile(path, []byte(strconv.Itoa(n)+"\n"), 0o644)
	return n
}

func fakeCloudflared([]string) int {
	n := fakeCount("tries")
	fmt.Println("INF Requesting new quick Tunnel on trycloudflare.com...")
	if n < 3 {
		fmt.Println("quick tunnel provisioning failed with status 429: [10000] Tunnelstore request failed")
		return 1
	}
	fmt.Println("INF |  https://made-up-words-here.trycloudflare.com  |")
	fmt.Println("INF Registered tunnel connection connIndex=0 protocol=quic")
	time.Sleep(time.Minute)
	return 0
}

func fakeMediaMTX(args []string) int {
	n := fakeCount("runs")
	if len(args) > 0 {
		if b, err := os.ReadFile(args[0]); err == nil {
			if f, err := os.OpenFile(filepath.Join(os.Getenv(fakeDirEnv), "apis"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644); err == nil {
				for _, line := range strings.Split(string(b), "\n") {
					if strings.Contains(line, "apiAddress") {
						fmt.Fprintln(f, line)
					}
				}
				f.Close()
			}
		}
	}
	if n < 3 {
		fmt.Println("ERR listen tcp 127.0.0.1:1: bind: address already in use")
		return 1
	}
	return handOff(os.Getenv(fakeRealEnv), args)
}

func handOff(bin string, args []string) int {
	if runtime.GOOS != "windows" {
		err := syscall.Exec(bin, append([]string{bin}, args...), os.Environ())
		fmt.Fprintln(os.Stderr, err)
		return 126
	}
	cmd := exec.Command(bin, args...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	if err := cmd.Start(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 126
	}
	adopt(cmd)
	cmd.Wait()
	return cmd.ProcessState.ExitCode()
}
