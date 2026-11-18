package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	netrpc "net/rpc"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const (
	winProbeArg        = "--winprobe"
	winProbeUsage      = 2
	winProbeDenied     = 3
	winProbeNoStart    = 4
	winProbeFailed     = 5
	winProbeNotReached = 6
)

func init() {
	if len(os.Args) > 2 && os.Args[1] == winProbeArg {
		os.Exit(winProbe(os.Args[2], os.Args[3:]))
	}
}

type winProbeReport struct {
	Integrity string
	InJob     bool
	Limits    uint32
	Processes uint32
	UI        uint32
	Admin     bool
	Temp      string
}

func winProbe(op string, args []string) int {
	arg := func(i int) string {
		if i < len(args) {
			return args[i]
		}
		return ""
	}
	switch op {
	case "info":
		return winProbeInfo()
	case "write":
		return winProbeCode(os.WriteFile(arg(0), []byte("from the box"), 0o644))
	case "registry":
		return winProbeRegistry()
	case "start":
		return winProbeStart()
	case "exit":
		n, err := strconv.Atoi(arg(0))
		if err != nil {
			return winProbeUsage
		}
		return n
	case "wait":
		fmt.Println(os.Getpid())
		time.Sleep(2 * time.Minute)
		return 0
	case "pipe":
		return winProbePipe(arg(0))
	case "canary":
		if canaryReached(arg(0)) {
			return 0
		}
		return winProbeNotReached
	case "site":
		return winProbeSite(arg(0))
	case "adopt":
		return winProbeAdopt()
	case "detach":
		return winProbeDetach()
	case "cwd":
		dir, err := os.Getwd()
		if err != nil {
			return winProbeCode(err)
		}
		fmt.Println(dir)
		return 0
	case "console":
		fmt.Println(winConsoleWindow())
		return 0
	case "gui":
		return winProbeGUI()
	case "env":
		if err := json.NewEncoder(os.Stdout).Encode(os.Environ()); err != nil {
			return winProbeFailed
		}
		return 0
	}
	return winProbeUsage
}

func winProbeCode(err error) int {
	switch {
	case err == nil:
		return 0
	case errors.Is(err, fs.ErrPermission):
		return winProbeDenied
	}
	fmt.Fprintln(os.Stderr, err)
	return winProbeFailed
}

func winProbeInfo() int {
	var r winProbeReport
	var token windows.Token
	if err := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_QUERY, &token); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return winProbeFailed
	}
	defer token.Close()
	var n uint32
	windows.GetTokenInformation(token, windows.TokenIntegrityLevel, nil, 0, &n)
	if n == 0 {
		return winProbeFailed
	}
	b := make([]byte, n)
	if err := windows.GetTokenInformation(token, windows.TokenIntegrityLevel, &b[0], n, &n); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return winProbeFailed
	}
	r.Integrity = (*windows.Tokenmandatorylabel)(unsafe.Pointer(&b[0])).Label.Sid.String()
	if admins, err := windows.CreateWellKnownSid(windows.WinBuiltinAdministratorsSid); err == nil {
		r.Admin, _ = windows.Token(0).IsMember(admins)
	}
	var limits windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	if windows.QueryInformationJobObject(0, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)),
		uint32(unsafe.Sizeof(limits)), nil) == nil {
		r.InJob = true
		r.Limits, r.Processes = limits.BasicLimitInformation.LimitFlags, limits.BasicLimitInformation.ActiveProcessLimit
	}
	var ui windows.JOBOBJECT_BASIC_UI_RESTRICTIONS
	if windows.QueryInformationJobObject(0, windows.JobObjectBasicUIRestrictions, uintptr(unsafe.Pointer(&ui)),
		uint32(unsafe.Sizeof(ui)), nil) == nil {
		r.UI = ui.UIRestrictionsClass
	}
	r.Temp = os.TempDir()
	if err := json.NewEncoder(os.Stdout).Encode(r); err != nil {
		return winProbeFailed
	}
	return 0
}

func winProbeRegistry() int {
	path := `Software\Mouse Party box test ` + strconv.Itoa(os.Getpid())
	k, _, err := registry.CreateKey(registry.CURRENT_USER, path, registry.ALL_ACCESS)
	if err != nil {
		return winProbeCode(err)
	}
	k.Close()
	registry.DeleteKey(registry.CURRENT_USER, path)
	return 0
}

func winProbeStart() int {
	exe, err := os.Executable()
	if err != nil {
		return winProbeFailed
	}
	if err := exec.Command(exe, winProbeArg, "exit", "0").Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return winProbeNoStart
	}
	return 0
}

func winProbePipe(handle string) int {
	h, err := strconv.ParseUint(handle, 10, 64)
	if err != nil || h == 0 {
		return winProbeUsage
	}
	f := os.NewFile(uintptr(h), "pipe")
	_, err = f.WriteString("through the box")
	f.Close()
	return winProbeCode(err)
}

func winProbeAdopt() int {
	exe, err := os.Executable()
	if err != nil {
		return winProbeFailed
	}
	cmd := exec.Command(exe, winProbeArg, "wait")
	cmd.Stdout = os.Stdout
	if err := cmd.Start(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return winProbeFailed
	}
	adopt(cmd)
	time.Sleep(2 * time.Minute)
	return 0
}

func winProbeDetach() int {
	if _, err := bufio.NewReader(os.Stdin).ReadString('\n'); err != nil {
		return winProbeUsage
	}
	exe, err := os.Executable()
	if err != nil {
		return winProbeFailed
	}
	cmd := exec.Command(exe, winProbeArg, "wait")
	cmd.Stdout = os.Stdout
	detach(cmd)
	if err := cmd.Start(); err != nil {
		fmt.Println("not started:", err)
		return winProbeNoStart
	}
	cmd.Process.Release()
	return 0
}

func winConsoleWindow() string {
	w, _, _ := windows.NewLazySystemDLL("kernel32.dll").NewProc("GetConsoleWindow").Call()
	if w == 0 {
		return "none"
	}
	if shown, _, _ := windows.NewLazySystemDLL("user32.dll").NewProc("IsWindowVisible").Call(w); shown != 0 {
		return "shown"
	}
	return "hidden"
}

type winLogBrush struct {
	Style uint32
	Color uint32
	Hatch uintptr
}

type winLogFont struct {
	Height, Width, Escapement, Orientation, Weight int32
	Italic, Underline, StrikeOut, CharSet          byte
	OutPrecision, ClipPrecision, Quality, Pitch    byte
	FaceName                                       [32]uint16
}

type winGdiplusInput struct {
	Version                  uint32
	DebugEventCallback       uintptr
	SuppressBackgroundThread int32
	SuppressExternalCodecs   int32
}

type winGUICall struct {
	Call  string
	Fatal bool
	Err   string `json:",omitempty"`
}

func winProbeGUI() int {
	runtime.LockOSThread()
	var calls []winGUICall
	failed := false
	note := func(call string, fatal bool, err error) {
		c := winGUICall{Call: call, Fatal: fatal}
		if err != nil {
			c.Err = err.Error()
			failed = failed || fatal
		}
		calls = append(calls, c)
	}
	nonzero := func(r, _ uintptr, err error) error {
		if r != 0 {
			return nil
		}
		if errno, ok := err.(syscall.Errno); ok && errno != 0 {
			return err
		}
		return errors.New("it returned 0")
	}
	kernel32, user32, gdi32 := windows.NewLazySystemDLL("kernel32.dll"), windows.NewLazySystemDLL("user32.dll"),
		windows.NewLazySystemDLL("gdi32.dll")
	var module windows.Handle
	note("GetModuleHandle", true, windows.GetModuleHandleEx(0, nil, &module))
	note("LoadLibrary user32.dll", true, user32.Load())
	note("LoadLibrary gdi32.dll", true, gdi32.Load())
	if failed {
		json.NewEncoder(os.Stdout).Encode(calls)
		return winProbeFailed
	}
	note("GetSysColorBrush", true, nonzero(user32.NewProc("GetSysColorBrush").Call(15)))
	null, solid := winLogBrush{Style: 1}, winLogBrush{Color: 0xdc8c8c}
	note("CreateBrushIndirect, a null brush", true, nonzero(gdi32.NewProc("CreateBrushIndirect").Call(uintptr(unsafe.Pointer(&null)))))
	note("CreateBrushIndirect, a solid brush", true, nonzero(gdi32.NewProc("CreateBrushIndirect").Call(uintptr(unsafe.Pointer(&solid)))))
	note("ExtCreatePen", true, nonzero(gdi32.NewProc("ExtCreatePen").Call(0x10000, 2, uintptr(unsafe.Pointer(&solid)), 0, 0)))
	dc, _, _ := user32.NewProc("GetDC").Call(0)
	note("GetDC of the screen", false, nonzero(dc, 0, nil))
	var dpi uintptr
	if dc != 0 {
		dpi, _, _ = gdi32.NewProc("GetDeviceCaps").Call(dc, 90)
		user32.NewProc("ReleaseDC").Call(0, dc)
	}
	note("GetDeviceCaps", false, nonzero(dpi, 0, nil))
	height, _, _ := kernel32.NewProc("MulDiv").Call(8, dpi, 72)
	font := winLogFont{Height: -int32(height), Weight: 400, CharSet: 1, OutPrecision: 4, Quality: 5, Pitch: 0x22}
	face, _ := windows.UTF16FromString("MS Shell Dlg 2")
	copy(font.FaceName[:], face)
	note("CreateFontIndirect", true, nonzero(gdi32.NewProc("CreateFontIndirectW").Call(uintptr(unsafe.Pointer(&font)))))
	controls := [2]uint32{8, 0x2f}
	note("InitCommonControlsEx", false,
		nonzero(windows.NewLazyDLL("comctl32.dll").NewProc("InitCommonControlsEx").Call(uintptr(unsafe.Pointer(&controls)))))
	var token uintptr
	input := winGdiplusInput{Version: 1}
	status, _, _ := windows.NewLazyDLL("gdiplus.dll").NewProc("GdiplusStartup").Call(uintptr(unsafe.Pointer(&token)),
		uintptr(unsafe.Pointer(&input)), 0)
	if status != 0 {
		note("GdiplusStartup", true, fmt.Errorf("status %d", status))
	} else {
		note("GdiplusStartup", true, nil)
	}
	name, _ := windows.UTF16PtrFromString("WincV0.InvokeCallback")
	note("RegisterWindowMessage", false, nonzero(user32.NewProc("RegisterWindowMessageW").Call(uintptr(unsafe.Pointer(name)))))
	if hr, _, _ := windows.NewLazySystemDLL("ole32.dll").NewProc("CoInitializeEx").Call(0, windows.COINIT_APARTMENTTHREADED); int32(hr) < 0 {
		note("CoInitializeEx", false, fmt.Errorf("HRESULT %#x", uint32(hr)))
	} else {
		note("CoInitializeEx", false, nil)
	}
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows NT\CurrentVersion`, registry.QUERY_VALUE)
	if err == nil {
		k.Close()
	}
	note("the Windows version from the registry", false, err)
	if err := json.NewEncoder(os.Stdout).Encode(calls); err != nil || failed {
		return winProbeFailed
	}
	return 0
}

type winSiteProbe struct {
	mac *netrpc.Client
	pid int
}

func (p *winSiteProbe) Pid(_ None, r *SitePid) error {
	r.Pid = p.pid
	return nil
}

func (p *winSiteProbe) Tell(t SiteTell, r *SiteKept) error {
	f := (&siteSide{}).received(t)
	if f == nil {
		return errors.New("no file came with it")
	}
	defer f.Close()
	b, err := io.ReadAll(f)
	if err != nil {
		return err
	}
	r.Name, r.B, r.OK = t.Doc.Token, b, true
	return p.mac.Call("Mac.Event", SiteEvent{Kind: "log", Text: "read " + t.Doc.Token}, &None{})
}

func winProbeSite(claim string) int {
	_, told, asks, _, err := siteEnds()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return winProbeFailed
	}
	p := &winSiteProbe{mac: netrpc.NewClient(asks), pid: os.Getpid()}
	if claim != "" {
		if p.pid, err = strconv.Atoi(claim); err != nil {
			return winProbeUsage
		}
	}
	calls := netrpc.NewServer()
	if err := calls.RegisterName("Site", p); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return winProbeFailed
	}
	calls.ServeConn(told)
	return 0
}

func winExe(t *testing.T) string {
	t.Helper()
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	return exe
}

func winBoxed(t *testing.T, writes []string, args ...string) *exec.Cmd {
	t.Helper()
	if !sandboxing() {
		t.Fatal("the sandbox is off here:", sandboxMissing())
	}
	return newBox(winExe(t)).write(writes...).command(nil, append([]string{winProbeArg}, args...)...)
}

func winRun(t *testing.T, cmd *exec.Cmd) (int, string, string) {
	t.Helper()
	var out, errs bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errs
	err := cmd.Run()
	var exit *exec.ExitError
	if err != nil && !errors.As(err, &exit) {
		t.Fatal(err)
	}
	return cmd.ProcessState.ExitCode(), out.String(), errs.String()
}

func winStartWaiting(t *testing.T, cmd *exec.Cmd) (windows.Handle, func() error) {
	t.Helper()
	return winStartWaitingAfter(t, cmd, nil)
}

func winStartWaitingAfter(t *testing.T, cmd *exec.Cmd, started func()) (windows.Handle, func() error) {
	t.Helper()
	out, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	wait := sync.OnceValue(cmd.Wait)
	t.Cleanup(func() {
		cmd.Process.Kill()
		wait()
	})
	if started != nil {
		started()
	}
	line := make(chan string, 1)
	go func() {
		s := bufio.NewScanner(out)
		s.Scan()
		line <- s.Text()
	}()
	var said string
	select {
	case said = <-line:
	case <-time.After(30 * time.Second):
		t.Fatal("the probe didn't say who it is")
	}
	pid, err := strconv.Atoi(strings.TrimSpace(said))
	if err != nil {
		t.Fatalf("the probe said %q, not who it is", said)
	}
	h, err := windows.OpenProcess(windows.SYNCHRONIZE|windows.PROCESS_TERMINATE|windows.PROCESS_QUERY_LIMITED_INFORMATION,
		false, uint32(pid))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		windows.TerminateProcess(h, 1)
		windows.CloseHandle(h)
	})
	return h, wait
}

func winGone(t *testing.T, h windows.Handle, within time.Duration, why string) {
	t.Helper()
	if ev, err := windows.WaitForSingleObject(h, uint32(within/time.Millisecond)); ev != windows.WAIT_OBJECT_0 {
		t.Fatal(why, err)
	}
}

func winLabel(t *testing.T, path string) string {
	t.Helper()
	sd, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.LABEL_SECURITY_INFORMATION)
	if err != nil {
		t.Fatal(err)
	}
	return sd.String()
}

func TestWindowsBoxRunsLowInAJobOfItsOwn(t *testing.T) {
	tempHome(t)
	dir := t.TempDir()
	code, out, errs := winRun(t, winBoxed(t, []string{dir}, "info"))
	if code != 0 {
		t.Fatalf("the probe in the box: %d %s", code, errs)
	}
	var r winProbeReport
	if err := json.Unmarshal([]byte(out), &r); err != nil {
		t.Fatal(err, out)
	}
	if r.Integrity != "S-1-16-4096" {
		t.Fatal("not low integrity:", r.Integrity)
	}
	if r.Admin {
		t.Fatal("in the box, it still counts as an administrator")
	}
	if !r.InJob || r.Processes != 1 || r.Limits&boxLimitFlags != boxLimitFlags {
		t.Fatalf("not in the box's job: %+v", r)
	}
	if strings.Contains(errs, boxNestedNote) {
		t.Log("here the box has no window or clipboard limits:", strings.TrimSpace(errs))
	} else if r.UI != boxUILimits {
		t.Fatalf("the job's window and clipboard limits are %#x, not %#x", r.UI, boxUILimits)
	}
	if !strings.EqualFold(realPath(r.Temp), realPath(dir)) {
		t.Fatalf("its temporary folder is %s, not the one it may write, %s", r.Temp, dir)
	}
}

func TestWindowsBoxWritesOnlyWhereItIsLet(t *testing.T) {
	tempHome(t)
	open, closed := t.TempDir(), t.TempDir()
	before := filepath.Join(open, "the app's")
	mine := filepath.Join(closed, "the user's")
	for _, f := range []string{before, mine} {
		if err := os.WriteFile(f, []byte("not the box's"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for _, c := range []struct {
		path string
		want int
	}{
		{filepath.Join(open, "new"), 0},
		{before, winProbeDenied},
		{filepath.Join(closed, "new"), winProbeDenied},
		{mine, winProbeDenied},
	} {
		if code, _, errs := winRun(t, winBoxed(t, []string{open}, "write", c.path)); code != c.want {
			t.Errorf("writing %s from the box: %d, not %d %s", c.path, code, c.want, errs)
		}
	}
	if b, _ := os.ReadFile(mine); string(b) != "not the box's" {
		t.Error("the box changed a file it was never given")
	}
	if code, _, errs := winRun(t, winBoxed(t, nil, "registry")); code != winProbeDenied {
		t.Errorf("a key in the user's registry from the box: %d %s", code, errs)
	}
}

func TestWindowsBoxStartsNoProgram(t *testing.T) {
	tempHome(t)
	if code, _, errs := winRun(t, exec.Command(winExe(t), winProbeArg, "start")); code != 0 {
		t.Fatalf("outside the box the probe can't start a program either: %d %s", code, errs)
	}
	if code, _, errs := winRun(t, winBoxed(t, nil, "start")); code != winProbeNoStart {
		t.Fatalf("the box started a program: %d %s", code, errs)
	}
}

func TestWindowsBoxGoesWithItsLauncher(t *testing.T) {
	tempHome(t)
	cmd := winBoxed(t, nil, "wait")
	inside, wait := winStartWaiting(t, cmd)
	cmd.Process.Kill()
	wait()
	winGone(t, inside, 10*time.Second, "the program in the box outlived its launcher")
}

func TestWindowsBoxGoesWithTheApp(t *testing.T) {
	tempHome(t)
	exe := winExe(t)
	app := exec.Command(exe, winProbeArg, "wait")
	_, appGone := winStartWaiting(t, app)
	spec, err := json.Marshal(boxSpec{App: app.Process.Pid})
	if err != nil {
		t.Fatal(err)
	}
	launcher := exec.Command(exe, boxArg, string(spec), "--", realPath(exe), winProbeArg, "wait")
	noConsole(launcher)
	inside, launcherGone := winStartWaiting(t, launcher)
	app.Process.Kill()
	appGone()
	winGone(t, inside, 10*time.Second, "the program in the box outlived the app")
	done := make(chan error, 1)
	go func() { done <- launcherGone() }()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("the launcher outlived the app")
	}
}

func TestWindowsBoxHandsOnHandlesAndExitCodes(t *testing.T) {
	tempHome(t)
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	h := windows.Handle(w.Fd())
	if err := windows.SetHandleInformation(h, windows.HANDLE_FLAG_INHERIT, windows.HANDLE_FLAG_INHERIT); err != nil {
		t.Fatal(err)
	}
	cmd := newBox(winExe(t)).inherit(uintptr(h)).command(nil, winProbeArg, "pipe", strconv.FormatUint(uint64(h), 10))
	procAttr(cmd).AdditionalInheritedHandles = []syscall.Handle{syscall.Handle(h)}
	var errs bytes.Buffer
	cmd.Stderr = &errs
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	w.Close()
	got, _ := io.ReadAll(r)
	if err := cmd.Wait(); err != nil {
		t.Fatal(err, errs.String())
	}
	if string(got) != "through the box" {
		t.Fatalf("through a handle it was given, the box wrote %q", got)
	}
	if code, _, errs := winRun(t, winBoxed(t, nil, "exit", "7")); code != 7 {
		t.Fatalf("the launcher passed on %d, not 7 %s", code, errs)
	}
	missing := newBox(filepath.Join(t.TempDir(), "missing.exe")).command(nil)
	if code, _, _ := winRun(t, missing); code != boxStartFailed {
		t.Fatalf("a program that isn't there: %d, not %d", code, boxStartFailed)
	}
}

func TestWindowsBoxPassesOnOnlyTheVariablesProgramsNeed(t *testing.T) {
	tempHome(t)
	bare := exec.Command(winExe(t), winProbeArg, "env")
	bare.Env = []string{}
	itsOwn := winProbeEnv(t, bare)
	t.Setenv("MOUSEPARTY_TEST_SECRET", "not for the box")
	t.Setenv("Tz", "Mouse Party time")
	if !sandboxing() {
		t.Fatal("the sandbox is off here:", sandboxMissing())
	}
	b := newBox(winExe(t))
	b.spec.Env = []string{"MOUSEPARTY_TEST_GIVEN=by the app"}
	got := winProbeEnv(t, b.command(nil, winProbeArg, "env"))
	for name := range got {
		if _, set := itsOwn[name]; !set && name != "MOUSEPARTY_TEST_GIVEN" &&
			!slices.ContainsFunc(boxEnvNames, func(n string) bool { return strings.ToUpper(n) == name }) {
			t.Errorf("%s reached the program in the box, and isn't one of the variables programs need", name)
		}
	}
	for name, want := range map[string]string{"TZ": "Mouse Party time", "MOUSEPARTY_TEST_GIVEN": "by the app",
		"SYSTEMROOT": os.Getenv("SystemRoot"), "PATH": os.Getenv("PATH")} {
		if want == "" || got[name] != want {
			t.Errorf("in the box %s is %q, not %q", name, got[name], want)
		}
	}
}

func winProbeEnv(t *testing.T, cmd *exec.Cmd) map[string]string {
	t.Helper()
	code, out, errs := winRun(t, cmd)
	if code != 0 {
		t.Fatalf("the probe: %d %s", code, errs)
	}
	var env []string
	if err := json.Unmarshal([]byte(out), &env); err != nil {
		t.Fatal(err, out)
	}
	vars := map[string]string{}
	for _, kv := range env {
		if name, value, _ := strings.Cut(kv, "="); name != "" {
			vars[strings.ToUpper(name)] = value
		}
	}
	return vars
}

func TestWindowsBoxVariablesAreMatchedWhateverTheirCase(t *testing.T) {
	environ := []string{`Path=C:\Windows\system32`, `systemroot=C:\Windows`, `=C:=C:\Users\Ann`, `GITHUB_TOKEN=a secret`,
		`TEMP=C:\Users\Ann\AppData\Local\Temp`, `ProgramFiles(x86)=C:\Program Files (x86)`, `ProgramFiles=C:\Program Files`,
		`MOUSEPARTY_SITE=1,2,3,4`, `not a variable`}
	got := boxEnv([]string{`XDG_CACHE_HOME=C:\box\fontconfig`, `TEMP=C:\from the spec`, `TEMP=C:\box`}, environ)
	want := []string{`MOUSEPARTY_SITE=1,2,3,4`, `Path=C:\Windows\system32`, `ProgramFiles=C:\Program Files`,
		`ProgramFiles(x86)=C:\Program Files (x86)`, `systemroot=C:\Windows`, `TEMP=C:\box`, `XDG_CACHE_HOME=C:\box\fontconfig`}
	if !slices.Equal(got, want) {
		t.Fatalf("the box's variables are\n%q, not\n%q", got, want)
	}
	block, err := envBlock(want[:2])
	if err != nil {
		t.Fatal(err)
	}
	if s := string(utf16.Decode(block)); s != want[0]+"\x00"+want[1]+"\x00\x00" {
		t.Fatalf("the environment block is %q", s)
	}
	if empty, err := envBlock(nil); err != nil || !slices.Equal(empty, []uint16{0, 0}) {
		t.Fatalf("an empty environment block is %v (%v), not two NULs", empty, err)
	}
	if _, err := envBlock([]string{"A=b\x00c"}); err == nil {
		t.Fatal("a variable with a NUL in it went into the environment block")
	}
}

func TestWindowsBoxLabelsOnlyWhatItIsGiven(t *testing.T) {
	tempHome(t)
	dir := realPath(t.TempDir())
	temp, err := openToBox([]string{dir})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.EqualFold(temp, dir) {
		t.Fatalf("its temporary folder is %q, not %q", temp, dir)
	}
	if l := winLabel(t, dir); !strings.Contains(l, "(ML;;NW;;;LW)") {
		t.Fatalf("the folder's label is %q, low and for itself alone", l)
	}
	after := filepath.Join(dir, "after")
	if err := os.WriteFile(after, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if l := winLabel(t, after); strings.Contains(l, "LW") {
		t.Fatalf("a file the app puts in the box's folder is open to the box too: %q", l)
	}
	holdCanary(after)
	if l := winLabel(t, after); !strings.Contains(l, "(ML;;NW;;;ME)") {
		t.Fatalf("the canary's label is %q", l)
	}
	for _, p := range []string{os.Getenv("SystemRoot"), realPath(os.TempDir()), `relative\folder`} {
		if _, err := openToBox([]string{p}); err == nil {
			t.Errorf("%s was opened to the box", p)
		}
	}
	target := t.TempDir()
	link := filepath.Join(dir, "link")
	if out, err := exec.Command("cmd", "/c", "mklink", "/J", link, target).CombinedOutput(); err != nil {
		t.Fatal(err, string(out))
	}
	if _, err := openToBox([]string{link}); err == nil || !strings.Contains(err.Error(), "link") {
		t.Fatal("a link was followed:", err)
	}
	if l := winLabel(t, target); strings.Contains(l, "LW") {
		t.Fatal("what a link points to was opened to the box")
	}
}

func TestWindowsBoxOpensOnlyMousePartysOwnFolders(t *testing.T) {
	temp, cache := `C:\Users\Ann\AppData\Local\Temp`, `C:\Users\Ann\AppData\Local\Mouse Party\wasm`
	for _, c := range []struct {
		path string
		want bool
	}{
		{`C:\Users\Ann\AppData\Local\Temp\mouseparty-host-1`, true},
		{`C:\Users\Ann\AppData\Local\Temp\mouseparty-host-1\site`, true},
		{`c:\users\ann\appdata\local\temp\mouseparty-1.txt`, true},
		{`C:\Users\Ann\AppData\Local\Temp`, false},
		{`C:\Users\Ann\AppData\Local\Temp\..\Microsoft`, false},
		{`C:\Users\Ann\AppData\Local\Mouse Party\wasm`, true},
		{`C:\Users\Ann\AppData\Local\Mouse Party\wasm\wazero`, true},
		{`C:\Users\Ann\AppData\Local\Mouse Party`, false},
		{`C:\Users\Ann\AppData\Local\Mouse Party\party.sqlite`, false},
		{`C:\Users\Ann\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`, false},
		{`D:\Users\Ann\AppData\Local\Temp\x`, false},
		{`Temp\x`, false},
	} {
		if got := mayOpenToBox(c.path, temp, cache); got != c.want {
			t.Errorf("%s: %v, not %v", c.path, got, c.want)
		}
	}
	if mayOpenToBox(`C:\Users\Ann\AppData\Local\Mouse Party\wasm`, temp, "") {
		t.Error("with no cache folder known, the cache was opened")
	}
}

func TestWindowsBoxLetsTheWindowCodeStart(t *testing.T) {
	tempHome(t)
	for _, c := range []struct {
		where string
		cmd   *exec.Cmd
	}{
		{"outside the box", exec.Command(winExe(t), winProbeArg, "gui")},
		{"in the box", winBoxed(t, nil, "gui")},
	} {
		code, out, errs := winRun(t, c.cmd)
		var calls []winGUICall
		if err := json.Unmarshal([]byte(out), &calls); err != nil {
			t.Fatalf("%s: %v %q %s", c.where, err, out, errs)
		}
		for _, call := range calls {
			if call.Err != "" {
				t.Logf("%s, %s: %s", c.where, call.Call, call.Err)
			}
		}
		if code != 0 {
			t.Errorf("%s, a call Wails makes before main and panics on failing fails, so Mouse Party would stop there: %d %s",
				c.where, code, errs)
		}
	}
}

func TestWindowsBoxKeepsTheWorkingDirectoryItIsStartedIn(t *testing.T) {
	tempHome(t)
	dir := t.TempDir()
	for _, cmd := range []*exec.Cmd{winBoxed(t, nil, "cwd"), winBoxed(t, []string{t.TempDir()}, "cwd")} {
		cmd.Dir = dir
		code, out, errs := winRun(t, cmd)
		if code != 0 {
			t.Fatalf("the probe in the box: %d %s", code, errs)
		}
		if got := strings.TrimSpace(out); !strings.EqualFold(realPath(got), realPath(dir)) {
			t.Fatalf("in the box the working directory is %s, not %s, where it was started", got, dir)
		}
	}
}

func TestWindowsNothingTheAppStartsOpensAConsoleWindow(t *testing.T) {
	tempHome(t)
	exe := winExe(t)
	if !sandboxing() {
		t.Fatal("the sandbox is off here:", sandboxMissing())
	}
	type start struct {
		how  string
		cmd  *exec.Cmd
		want []string
	}
	run, argv := newBox(exe).argv(winProbeArg, "console")
	starts := []start{
		{"a box", winBoxed(t, nil, "console"), []string{"none"}},
		{"a watched tool in its box", watched(run, argv), []string{"none"}},
	}
	t.Cleanup(func() { sandboxOff.Store(false) })
	sandboxOff.Store(true)
	run, argv = newBox(exe).argv(winProbeArg, "console")
	starts = append(starts,
		start{"a program without its box", newBox(exe).command(nil, winProbeArg, "console"), []string{"none", "hidden"}},
		start{"a watched tool without its box", watched(run, argv), []string{"none", "hidden"}})
	sandboxOff.Store(false)
	for _, s := range starts {
		if f := s.cmd.SysProcAttr.CreationFlags; f&windows.CREATE_NO_WINDOW == 0 {
			t.Errorf("%s is started without CREATE_NO_WINDOW: %#x", s.how, f)
		}
		code, out, errs := winRun(t, s.cmd)
		if got := strings.TrimSpace(out); code != 0 || !slices.Contains(s.want, got) {
			t.Errorf("%s: %d, its console window %q, not one of %v %s", s.how, code, got, s.want, errs)
		}
	}
	helper := exec.Command(exe, winProbeArg, "exit", "0")
	detach(helper)
	if helper.SysProcAttr.CreationFlags&windows.DETACHED_PROCESS == 0 {
		t.Error("a detached helper gets a console of its own")
	}
}
