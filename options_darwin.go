package main

import (
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

func platformOptions(app *App, o *options.App) {
	o.Mac = &mac.Options{
		OnFileOpen: app.openFile, // dropped on the Dock icon (packaging/darwin/Info.plist says anything can be)
	}
}

func (a *App) openArgs(string, []string) {}

func attachConsole() {}
