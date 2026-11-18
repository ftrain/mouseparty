package main

import (
	"os"
	"os/exec"
	"strconv"
)

const eraseFailureShown = true

// afterErase: once this process has gone, what it couldn't delete while it ran (its window's
// place and the web view's own storage, which AppKit and WebKit write as it quits), then the app
// opened again, if it's an app (bundle "": wails dev, only the deleting)
func afterErase(bundle string) {
	const id = "io.github.ftrain.mouseparty" // packaging/darwin/Info.plist
	paths := append(webviewFolders(), erasable()...)
	script := `while kill -0 "$0" 2>/dev/null; do sleep 0.2; done
/usr/bin/defaults delete "$1" 2>/dev/null
shift 2
bundle=$1; shift
rm -rf "$@"
[ -n "$bundle" ] && exec /usr/bin/open "$bundle"`
	cmd := exec.Command("/bin/sh", append([]string{"-c", script, strconv.Itoa(os.Getpid()), id, bundle}, paths...)...)
	detach(cmd) // not stopped with us
	cmd.Start()
}
