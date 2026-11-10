// Mouse Party: watch movies with friends, hosted from this Mac, gone when you quit.
//
// A Wails app: two big buttons (Play/Stop, and Copy link) over a list of movies,
// music and PDFs (app.go, frontend/). It plays them one after another with ffmpeg
// (stream.go) into this Mac's own MediaMTX; host.go serves friends the page
// (host_web/: WebRTC video, HLS fallback, chat) behind a link with a random key.
// No server anywhere else. Quit, and the session, the chat and the link are gone.
//
//	MouseParty               the app
//	MouseParty --selftest    host on free ports, check it all works, and stop
//	MouseParty --site        the viewer site in its sandbox: the app starts this itself (site.go)
//
// The queue and settings, and what apps keep (the graffiti wall, the last poll),
// live in ~/Library/Application Support/Mouse Party; nothing else about a
// session does.
package main

import (
	"context"
	"embed"
	"os"
	"os/signal"
	"syscall"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend
var frontend embed.FS

//go:embed host_web
var hostWeb embed.FS

//go:embed media/standby_opus.mp4
var standby []byte

func main() {
	setToolPath()
	if len(os.Args) > 1 && os.Args[1] == "--selftest" {
		os.Exit(selftest())
	}
	if len(os.Args) > 1 && os.Args[1] == siteArg { // the viewer site, in its sandbox, started by the app (site.go)
		os.Exit(siteMain())
	}
	app := NewApp(standby)
	var ctx context.Context
	go func() { // Terminal closed, logout, kill: still leave nothing behind
		s := make(chan os.Signal, 1)
		signal.Notify(s, syscall.SIGHUP, syscall.SIGTERM)
		<-s
		app.shutdown(ctx)
		os.Exit(0)
	}()
	err := wails.Run(&options.App{
		Title:            "Mouse Party",
		Width:            520,
		Height:           620,
		MinWidth:         380,
		MinHeight:        400,
		AssetServer:      &assetserver.Options{Assets: frontend},
		BackgroundColour: &options.RGBA{R: 236, G: 236, B: 236, A: 255},
		OnStartup:        func(c context.Context) { ctx = c; app.startup(c) },
		OnDomReady:       func(context.Context) { nativeKeepFrame() }, // where it was last time (native_darwin.go)
		OnBeforeClose:    app.beforeClose,
		OnShutdown:       app.shutdown,
		DragAndDrop:      &options.DragAndDrop{EnableFileDrop: true, DisableWebViewDrop: true},
		Bind:             []any{app},
		Menu:             app.menu(),
		// one copy: a second would find the ports taken and host nothing; it shows this one instead
		SingleInstanceLock: &options.SingleInstanceLock{UniqueId: "io.github.ftrain.mouseparty",
			OnSecondInstanceLaunch: func(options.SecondInstanceData) { runtime.WindowUnminimise(ctx); runtime.Show(ctx) }},
		Mac: &mac.Options{
			OnFileOpen: app.openFile, // dropped on the Dock icon (packaging/darwin/Info.plist says anything can be)
		},
	})
	if err != nil {
		println("Error:", err.Error())
		os.Exit(1)
	}
}
