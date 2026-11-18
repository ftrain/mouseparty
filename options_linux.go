package main

import (
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

const menuBarHeight = 27

func platformOptions(app *App, o *options.App) {
	icon, _ := hostWeb.ReadFile("host_web/icon.png")
	o.Linux = &linux.Options{Icon: icon, ProgramName: "mouseparty", WebviewGpuPolicy: linux.WebviewGpuPolicyNever}
	o.EnableDefaultContextMenu = true
	o.DragAndDrop.DisableWebViewDrop = false
	o.Height, o.MinHeight = o.Height+menuBarHeight, o.MinHeight+menuBarHeight
	applyFrame(o)
}

func attachConsole() {}
