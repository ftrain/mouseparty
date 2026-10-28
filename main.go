// TubeYap: watch movies with friends, hosted from this Mac, gone when you quit.
//
// A Wails app: two big buttons (Play/Stop, and Copy link) over a list of movies,
// music and PDFs (app.go, frontend/). It plays them one after another with ffmpeg
// (stream.go) into this Mac's own MediaMTX; host.go serves friends the page
// (host_web/: WebRTC video, HLS fallback, chat) behind a link with a random key.
// No server anywhere else. Quit, and the session, the chat and the link are gone.
//
//	TubeYap               the app
//	TubeYap --selftest    host on free ports, check it all works, and stop
//
// The queue and settings live in ~/.tubeyap.json; nothing about a session does.
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
		Title:            "TubeYap",
		Width:            520,
		Height:           620,
		MinWidth:         380,
		MinHeight:        400,
		AssetServer:      &assetserver.Options{Assets: frontend},
		BackgroundColour: &options.RGBA{R: 236, G: 236, B: 236, A: 255},
		OnStartup:        func(c context.Context) { ctx = c; app.startup(c) },
		OnBeforeClose:    app.beforeClose,
		OnShutdown:       app.shutdown,
		DragAndDrop:      &options.DragAndDrop{EnableFileDrop: true, DisableWebViewDrop: true},
		Bind:             []any{app},
		Menu:             app.menu(),
		Mac: &mac.Options{
			About: &mac.AboutInfo{Title: "TubeYap", Message: "Watch movies with friends, hosted from this Mac.\n\n" +
				"MIT licence. It includes ffmpeg (GPL), MediaMTX, cloudflared and more, each under its own " +
				"licence: see Contents/Resources/Licenses inside the app, and github.com/ftrain/tubeyap."},
		},
	})
	if err != nil {
		println("Error:", err.Error())
		os.Exit(1)
	}
}
