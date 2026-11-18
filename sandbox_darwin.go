package main

// The sandbox: everything a stranger's bytes can reach runs in a box of macOS's
// own (Seatbelt, through /usr/bin/sandbox-exec), which says no to all but what
// it's told here. Each program gets a profile written for the one run:
//
//	the viewer site (site.go)  reads the app's own pages and tools, writes its own
//	                           temporary folder, listens on the site's port, and
//	                           reaches only MediaMTX's ports on this Mac
//	MediaMTX                   reads and writes the session's folder; this Mac's
//	                           ports, the ICE port, and UDP out (the video itself)
//	cloudflared                no files; out to Cloudflare, and in to the site's port
//	ffmpeg                     reads the files it's given by name, writes only the
//	                           app's own temporary ones, and reaches only MediaMTX
//
// None may start another program, and none sees the home folder. So a hole in any
// of them is a hole into that box: the session, not the Mac. A box can't be put on
// from outside a running program or widened after, which is why the site is a
// process of its own, handed what it serves (site.go), rather than part of the app,
// which has to read whatever is dragged into it.
//
// Apple calls sandbox-exec deprecated and has for a decade; browsers and build
// tools use the same boxes. The party file's "no_sandbox" (Edit as Text) turns
// it all off, for a macOS where a profile here turns out to be wrong.

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const sandboxExec = "/usr/bin/sandbox-exec"

func sandboxMissing() string {
	if _, err := os.Stat(sandboxExec); err != nil {
		return "No " + sandboxExec + " on this Mac"
	}
	return ""
}

func sandboxLimits() string { return "" }

// box is one program's profile: nothing, but for what's allowed here
type box struct {
	bin    string
	rules  []string
	params []string
}

// newBox: bin may run (and nothing else may be started), with what every program needs of the system
func newBox(bin string) *box {
	b := &box{bin: realPath(bin)}
	b.rules = []string{"(version 1)", "(deny default)", `(import "system.sb")`,
		"(allow process-exec (literal " + b.param(b.bin) + "))",
		"(allow file-read* (literal " + b.param(b.bin) + "))",
		// that its folder is there, and no more of it: macOS's certificate checking won't start without (it looks for a bundle)
		"(allow file-read-metadata (literal " + b.param(filepath.Dir(b.bin)) + "))"}
	return b
}

// param: a value handed to the profile beside it (-D), so no path's characters are ever profile text
func (b *box) param(value string) string {
	name := fmt.Sprintf("P%d", len(b.params))
	b.params = append(b.params, "-D", name+"="+value)
	return `(param "` + name + `")`
}

// where: a path as a filter: all under it if it's a folder, else the one file
func (b *box) where(path string) string {
	path = realPath(path)
	if st, err := os.Stat(path); err == nil && st.IsDir() {
		return "(subpath " + b.param(path) + ")"
	}
	return "(literal " + b.param(path) + ")"
}

// read: these files (or all under these folders) can be read; "" is skipped
func (b *box) read(paths ...string) *box {
	for _, p := range paths {
		if p != "" {
			b.rules = append(b.rules, "(allow file-read* "+b.where(p)+")")
		}
	}
	return b
}

// write: these can be read and written
func (b *box) write(paths ...string) *box {
	for _, p := range paths {
		if p != "" {
			b.rules = append(b.rules, "(allow file-read* file-write* "+b.where(p)+")")
		}
	}
	return b
}

// allow: more rules, as the profile language writes them
func (b *box) allow(rules ...string) *box {
	b.rules = append(b.rules, rules...)
	return b
}

// lookups: names looked up (DNS, through macOS's resolver) and certificates checked (its trust daemon)
func (b *box) lookups() *box {
	return b.allow("(system-network)",
		`(allow network-outbound (literal "/private/var/run/mDNSResponder"))`,
		`(allow file-read* (literal "/private/etc/resolv.conf") (literal "/private/etc/hosts") (literal "/private/var/run/resolv.conf"))`,
		`(allow mach-lookup (global-name "com.apple.trustd.agent") (global-name "com.apple.trustd"))`)
}

func (b *box) fonts() *box {
	// subtitles are drawn with macOS's fonts, found through its font daemon (libass, CoreText)
	return b.allow(`(allow mach-lookup (global-name "com.apple.fonts") (global-name "com.apple.FontObjectsServer"))`,
		`(allow file-read* (subpath "/Library/Fonts"))`,
		`(allow user-preference-read (preference-domain "kCFPreferencesAnyApplication" "com.apple.CoreText"))`)
}

func (b *box) reachLocal(ports ...int) *box {
	for _, p := range ports {
		b.allow(fmt.Sprintf(`(allow network-outbound (remote tcp "localhost:%d"))`, p))
	}
	return b
}

func (b *box) reachOut(ports ...int) *box {
	remote := make([]string, len(ports))
	for i, p := range ports {
		remote[i] = fmt.Sprintf(`(remote ip "*:%d")`, p)
	}
	return b.allow("(allow network-outbound " + strings.Join(remote, " ") + ")")
}

func (b *box) serveTCP(port int) *box {
	return b.allow(fmt.Sprintf(`(allow network-bind network-inbound (local tcp "*:%d"))`, port))
}

func (b *box) serveIP(port int) *box {
	return b.allow(fmt.Sprintf(`(allow network-bind network-inbound (local ip "*:%d"))`, port))
}

func (b *box) serveLocal(...int) *box {
	return b.allow(`(allow network-bind network-inbound (local ip "localhost:*"))`)
}

func (b *box) udpOut() *box { return b.allow(`(allow network-outbound (remote udp "*:*"))`) }

func (b *box) netlink() *box { return b }

func (b *box) inherit(...uintptr) *box { return b }

func (b *box) profile() string { return strings.Join(b.rules, "\n") + "\n" }

// argv: the command that runs the program with args in its box (or as it is, with no sandbox)
func (b *box) argv(args ...string) (string, []string) {
	if !sandboxing() {
		return b.bin, args
	}
	return sandboxExec, append(append([]string{"-p", b.profile()}, b.params...), append([]string{b.bin}, args...)...)
}

func boxMain([]string) int {
	fmt.Fprintln(os.Stderr, "macOS boxes programs with sandbox-exec")
	return 125
}
