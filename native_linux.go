package main

import (
	"context"
	"os"

	"golang.org/x/sys/unix"
)

const (
	onWindows         = false
	startsAtDomReady  = true
	clearsLinkAtClose = true
	quitTitle         = "Quit Mouse Party"
)

func nativeActive() bool { return !pageAway.Load() }

func stderrForLog() bool {
	_, err := unix.IoctlGetTermios(int(os.Stderr.Fd()), unix.TCGETS)
	return err == nil
}

func webviewData() []string { return nil }

func placement() (frame, bool) { return frame{}, false }

func showWindow(context.Context, frame) {}

func quitWithSession(*App, context.Context) {}
