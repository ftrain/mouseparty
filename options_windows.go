package main

import (
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	sys "golang.org/x/sys/windows"
)

const (
	windowChromeWidth  = 16
	windowChromeHeight = 59
)

func platformOptions(app *App, o *options.App) {
	o.Windows = &windows.Options{Theme: windows.SystemDefault, WindowClassName: windowClass, IsZoomControlEnabled: false}
	if dir := webView2Dir(); filepath.IsAbs(dir) {
		o.Windows.WebviewUserDataPath = dir
	}
	o.EnableDefaultContextMenu = true
	o.DragAndDrop.DisableWebViewDrop = false
	o.StartHidden = true
	o.Width, o.MinWidth = o.Width+windowChromeWidth, o.MinWidth+windowChromeWidth
	o.Height, o.MinHeight = o.Height+windowChromeHeight, o.MinHeight+windowChromeHeight
	applyFrame(o)
}

var attachConsoleProc = sys.NewLazySystemDLL("kernel32.dll").NewProc("AttachConsole")

const attachParentProcess = ^uintptr(0)

func attachConsole() {
	if h, err := sys.GetStdHandle(sys.STD_OUTPUT_HANDLE); err == nil && h != 0 && h != sys.InvalidHandle {
		return
	}
	if r, _, _ := attachConsoleProc.Call(attachParentProcess); r == 0 {
		return
	}
	if f, err := os.OpenFile("CONOUT$", os.O_WRONLY, 0); err == nil {
		os.Stdout, os.Stderr = f, f
	}
}
