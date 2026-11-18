package main

import (
	"runtime"
	"testing"
	"unsafe"

	"golang.org/x/sys/windows"
)

func TestSessionEndReachesTheApp(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	var (
		register   = user32.NewProc("RegisterClassExW")
		unregister = user32.NewProc("UnregisterClassW")
		create     = user32.NewProc("CreateWindowExW")
		destroy    = user32.NewProc("DestroyWindow")
		send       = user32.NewProc("SendMessageW")
		plain      = user32.NewProc("DefWindowProcW")
	)
	if err := plain.Find(); err != nil {
		t.Fatal(err)
	}
	var module windows.Handle
	if err := windows.GetModuleHandleEx(0, nil, &module); err != nil {
		t.Fatal(err)
	}
	class, _ := windows.UTF16PtrFromString(windowClass)
	wc := struct {
		size, style                        uint32
		proc                               uintptr
		clsExtra, wndExtra                 int32
		instance, icon, cursor, background uintptr
		menuName, className                *uint16
		iconSm                             uintptr
	}{proc: plain.Addr(), instance: uintptr(module), className: class}
	wc.size = uint32(unsafe.Sizeof(wc))
	if r, _, err := register.Call(uintptr(unsafe.Pointer(&wc))); r == 0 {
		t.Fatal("RegisterClassExW:", err)
	}
	defer unregister.Call(uintptr(unsafe.Pointer(class)), uintptr(module))
	title, _ := windows.UTF16PtrFromString("Mouse Party")
	h, _, err := create.Call(0, uintptr(unsafe.Pointer(class)), uintptr(unsafe.Pointer(title)), 0, 0, 0, 200, 200, 0, 0, uintptr(module), 0)
	if h == 0 {
		t.Fatal("CreateWindowExW:", err)
	}
	defer destroy.Call(h)
	if found := mainWindow(); found != windows.HWND(h) {
		t.Fatalf("the window of class %s is %#x, but mainWindow found %#x", windowClass, h, found)
	}

	ended := 0
	onSessionEnd(windows.HWND(h), func() { ended++ })
	t.Cleanup(func() { sessionNext.Store(0); sessionEnd.Store(nil) })

	const wmSetText, wmGetText = 0x000C, 0x000D
	busy, _ := windows.UTF16PtrFromString("Mouse Party – 6%")
	send.Call(h, wmSetText, 0, uintptr(unsafe.Pointer(busy)))
	got := make([]uint16, 64)
	n, _, _ := send.Call(h, wmGetText, uintptr(len(got)), uintptr(unsafe.Pointer(&got[0])))
	if text := windows.UTF16ToString(got[:n]); text != "Mouse Party – 6%" {
		t.Fatalf("with the session watched, the window's own messages no longer reach it: its title is %q", text)
	}
	send.Call(h, wmEndSession, 0, 0)
	if ended != 0 {
		t.Fatal("a sign-out someone canceled quit the app")
	}
	r, _, _ := send.Call(h, wmEndSession, 1, 0)
	if ended != 1 || r != 0 {
		t.Fatalf("the session ended and the app was told %d times (answered %d)", ended, r)
	}
}
