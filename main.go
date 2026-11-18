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
	"sync/atomic"
	"syscall"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend
var frontend embed.FS

//go:embed host_web
var hostWeb embed.FS

//go:embed media/standby_opus.mp4
var standby []byte

func main() {
	setToolPath()
	if len(os.Args) > 1 && os.Args[1] == boxArg {
		os.Exit(boxMain(os.Args[2:]))
	}
	if len(os.Args) > 1 && os.Args[1] == thenArg {
		os.Exit(thenMain(os.Args[2:]))
	}
	if len(os.Args) > 1 && os.Args[1] == "--selftest" {
		attachConsole()
		os.Exit(selftest())
	}
	if len(os.Args) > 1 && os.Args[1] == siteArg { // the viewer site, in its sandbox, started by the app (site.go)
		os.Exit(siteMain())
	}
	app := NewApp(standby)
	var started atomic.Pointer[context.Context]
	ctx := func() context.Context {
		if c := started.Load(); c != nil {
			return *c
		}
		return nil
	}
	go func() { // Terminal closed, logout, kill: still leave nothing behind
		s := make(chan os.Signal, 1)
		signal.Notify(s, syscall.SIGHUP, syscall.SIGTERM)
		<-s
		app.shutdown(ctx())
		os.Exit(0)
	}()
	opts := &options.App{
		Title:            "Mouse Party",
		Width:            520,
		Height:           620,
		MinWidth:         380,
		MinHeight:        400,
		AssetServer:      &assetserver.Options{Assets: frontend},
		BackgroundColour: &options.RGBA{R: 236, G: 236, B: 236, A: 255},
		OnStartup:        func(c context.Context) { started.Store(&c); app.startup(c) },
		OnDomReady:       app.domReady, // where it was last time
		OnBeforeClose:    app.beforeClose,
		OnShutdown:       app.shutdown,
		DragAndDrop:      &options.DragAndDrop{EnableFileDrop: true, DisableWebViewDrop: true},
		Bind:             []any{app},
		Menu:             app.menu(),
		// one copy: a second would find the ports taken and host nothing; it shows this one instead
		SingleInstanceLock: &options.SingleInstanceLock{UniqueId: "io.github.ftrain.mouseparty",
			OnSecondInstanceLaunch: func(second options.SecondInstanceData) {
				app.openArgs(second.WorkingDirectory, second.Args)
				if c := ctx(); c != nil {
					raise(c)
				}
			}},
	}
	platformOptions(app, opts)
	err := wails.Run(opts)
	if err != nil {
		println("Error:", err.Error())
		os.Exit(1)
	}
}
