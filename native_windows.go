package main

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"unsafe"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const (
	onWindows         = true
	startsAtDomReady  = false
	clearsLinkAtClose = false
	quitTitle         = "Exit Mouse Party"
	windowClass       = "MouseParty"
)

func nativeActive() bool {
	h := windows.GetForegroundWindow()
	if h == 0 {
		return false
	}
	var pid uint32
	if _, err := windows.GetWindowThreadProcessId(h, &pid); err != nil {
		return true
	}
	return pid == uint32(os.Getpid())
}

var (
	user32                 = windows.NewLazySystemDLL("user32.dll")
	procGetWindowPlacement = user32.NewProc("GetWindowPlacement")
	procSetWindowPlacement = user32.NewProc("SetWindowPlacement")
	enumMu                 sync.Mutex
	enumFound              windows.HWND
	enumCallback           = sync.OnceValue(func() uintptr { return windows.NewCallback(enumWindow) })
)

func enumWindow(h windows.HWND, _ uintptr) uintptr {
	var pid uint32
	if _, err := windows.GetWindowThreadProcessId(h, &pid); err != nil || pid != uint32(os.Getpid()) {
		return 1
	}
	name := make([]uint16, 64)
	if n, err := windows.GetClassName(h, &name[0], int32(len(name))); err == nil && windows.UTF16ToString(name[:n]) == windowClass {
		enumFound = h
		return 0
	}
	return 1
}

func mainWindow() windows.HWND {
	enumMu.Lock()
	defer enumMu.Unlock()
	enumFound = 0
	windows.EnumWindows(enumCallback(), nil)
	return enumFound
}

type windowPlacement struct {
	length, flags, showCmd   uint32
	minX, minY, maxX, maxY   int32
	left, top, right, bottom int32
}

const (
	swShowNormal         = 1
	swShowMinimized      = 2
	swShowMaximized      = 3
	wpfRestoreToMaximize = 2
)

func placement() (frame, bool) {
	h := mainWindow()
	if h == 0 {
		return frame{}, false
	}
	wp := windowPlacement{length: uint32(unsafe.Sizeof(windowPlacement{}))}
	if r, _, _ := procGetWindowPlacement.Call(uintptr(h), uintptr(unsafe.Pointer(&wp))); r == 0 {
		return frame{}, false
	}
	return frame{Left: int(wp.left), Top: int(wp.top), Width: int(wp.right - wp.left), Height: int(wp.bottom - wp.top), Placed: true,
		Maximized: wp.showCmd == swShowMaximized || wp.showCmd == swShowMinimized && wp.flags&wpfRestoreToMaximize != 0}, true
}

func showWindow(ctx context.Context, f frame) {
	if h := mainWindow(); h != 0 && f.Placed && f.Width > 0 && f.Height > 0 {
		wp := windowPlacement{length: uint32(unsafe.Sizeof(windowPlacement{})), showCmd: swShowNormal,
			left: int32(f.Left), top: int32(f.Top), right: int32(f.Left + f.Width), bottom: int32(f.Top + f.Height)}
		if f.Maximized {
			wp.showCmd = swShowMaximized
		}
		procSetWindowPlacement.Call(uintptr(h), uintptr(unsafe.Pointer(&wp)))
	}
	runtime.WindowShow(ctx)
}

var (
	procGetWindowLongPtr = user32.NewProc("GetWindowLongPtrW")
	procSetWindowLongPtr = user32.NewProc("SetWindowLongPtrW")
	procCallWindowProc   = user32.NewProc("CallWindowProcW")
	sessionNext          atomic.Uintptr
	sessionEnd           atomic.Pointer[func()]
	sessionProc          = sync.OnceValue(func() uintptr { return windows.NewCallback(sessionMessage) })
)

const (
	gwlpWndProc  = ^uintptr(3)
	wmEndSession = 0x0016
)

func quitWithSession(a *App, ctx context.Context) {
	onSessionEnd(mainWindow(), func() { a.quitAtSessionEnd(ctx); os.Exit(0) })
}

func onSessionEnd(h windows.HWND, end func()) {
	if h == 0 || sessionNext.Load() != 0 {
		return
	}
	next, _, _ := procGetWindowLongPtr.Call(uintptr(h), gwlpWndProc)
	if next == 0 {
		return
	}
	sessionEnd.Store(&end)
	sessionNext.Store(next)
	procSetWindowLongPtr.Call(uintptr(h), gwlpWndProc, sessionProc())
}

func sessionMessage(h windows.HWND, msg uint32, wparam, lparam uintptr) uintptr {
	if msg == wmEndSession && wparam != 0 {
		if end := sessionEnd.Load(); end != nil {
			(*end)()
		}
		return 0
	}
	r, _, _ := procCallWindowProc.Call(sessionNext.Load(), uintptr(h), uintptr(msg), wparam, lparam)
	return r
}

const toastClass = "{0F82E845-CB89-4039-BDBF-67CA33254C76}"

var guidShape = regexp.MustCompile(`^\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}$`)

func toastApp() (exe, app, guid string) {
	exe, err := os.Executable()
	if err != nil {
		return "", "", ""
	}
	app = filepath.Base(exe)
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Classes\AppUserModelId\`+app, registry.QUERY_VALUE)
	if err != nil {
		return exe, app, ""
	}
	defer k.Close()
	if g, _, err := k.GetStringValue("CustomActivator"); err == nil && guidShape.MatchString(g) {
		guid = g
	}
	return exe, app, guid
}

func webviewData() []string {
	exe, app, guid := toastApp()
	if app == "" {
		return nil
	}
	items := []string{registryRoot + `Software\Classes\AppUserModelId\` + app, registryRoot + `SOFTWARE\` + app}
	if guid != "" {
		items = append(items, filepath.Join(os.TempDir(), app+guid+".png"))
	}
	for _, class := range []string{guid, toastClass} {
		if class != "" && serves(`Software\Classes\CLSID\`+class+`\LocalServer32`, exe) {
			items = append(items, registryRoot+`Software\Classes\CLSID\`+class)
		}
	}
	return items
}

func serves(key, exe string) bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, key, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()
	path, _, err := k.GetStringValue("")
	return err == nil && strings.Contains(strings.ToLower(path), strings.ToLower(exe))
}

func stderrForLog() bool {
	var mode uint32
	return windows.GetConsoleMode(windows.Handle(os.Stderr.Fd()), &mode) == nil
}
