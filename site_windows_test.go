package main

import (
	"bytes"
	netrpc "net/rpc"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

type winMacProbe struct{ said chan string }

func (m *winMacProbe) Event(e SiteEvent, _ *None) error {
	select {
	case m.said <- e.Text:
	default:
	}
	return nil
}

type winSiteRun struct {
	cmd    *exec.Cmd
	link   *siteLink
	s      *siteProc
	mac    *winMacProbe
	exited chan error
	out    *bytes.Buffer
}

func winStartSite(t *testing.T, args ...string) *winSiteRun {
	t.Helper()
	if !sandboxing() {
		t.Fatal("the sandbox is off here:", sandboxMissing())
	}
	link, err := newSiteLink(nil)
	if err != nil {
		t.Fatal(err)
	}
	b := newBox(winExe(t))
	link.give(b)
	cmd := b.command(nil, append([]string{winProbeArg, "site"}, args...)...)
	cmd.Env = os.Environ()
	link.attach(cmd)
	out := &bytes.Buffer{}
	cmd.Stdout, cmd.Stderr = out, out
	if err := cmd.Start(); err != nil {
		link.closeTheirs()
		link.closeOurs()
		t.Fatal(err)
	}
	link.closeTheirs()
	adopt(cmd)
	r := &winSiteRun{cmd: cmd, link: link, mac: &winMacProbe{said: make(chan string, 1)}, exited: make(chan error, 1), out: out}
	r.s = &siteProc{cmd: cmd, calls: netrpc.NewClient(link.toSite), link: link, done: make(chan struct{}), began: time.Now()}
	asked := netrpc.NewServer()
	if err := asked.RegisterName("Mac", r.mac); err != nil {
		t.Fatal(err)
	}
	go asked.ServeConn(link.fromSite)
	go func() {
		r.exited <- cmd.Wait()
		close(r.s.done)
	}()
	t.Cleanup(func() {
		link.closeOurs()
		cmd.Process.Kill()
		<-r.s.done
	})
	return r
}

func TestWindowsSiteLinkThroughTheBox(t *testing.T) {
	tempHome(t)
	r := winStartSite(t)
	if err := r.link.started(r.s); err != nil {
		t.Fatal("the site in the box wasn't taken for the one the app started:", err, r.out.String())
	}
	doc := filepath.Join(t.TempDir(), "a paper.pdf")
	if err := os.WriteFile(doc, []byte("only this file"), 0o600); err != nil {
		t.Fatal(err)
	}
	f, err := os.Open(doc)
	if err != nil {
		t.Fatal(err)
	}
	tell := SiteTell{Do: "doc", Doc: document{Token: "t1"}}
	sent := r.link.send(&tell, f)
	f.Close()
	if !sent {
		t.Fatal("the document's file wasn't handed to the site")
	}
	var kept SiteKept
	if err := r.s.calls.Call("Site.Tell", tell, &kept); err != nil {
		t.Fatal(err, r.out.String())
	}
	if string(kept.B) != "only this file" {
		t.Fatalf("the site read %q from the file it was handed", kept.B)
	}
	select {
	case said := <-r.mac.said:
		if said != "read t1" {
			t.Fatalf("the site told the app %q", said)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("the site's call back to the app never came")
	}
	r.link.closeOurs()
	select {
	case err := <-r.exited:
		if err != nil {
			t.Fatal("the site didn't stop cleanly when the app's ends closed:", err, r.out.String())
		}
	case <-time.After(10 * time.Second):
		t.Fatal("the site didn't stop when the app's ends closed")
	}
}

func TestWindowsSiteThatClaimsAnotherProcessIsRefused(t *testing.T) {
	tempHome(t)
	r := winStartSite(t, strconv.Itoa(os.Getpid()))
	if err := r.link.started(r.s); err == nil {
		t.Fatal("a site that named another process was taken for the one the app started")
	}
	f, err := os.Open(winExe(t))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	tell := SiteTell{Do: "doc", Doc: document{Token: "t1"}}
	if r.link.send(&tell, f) {
		t.Fatal("a file was handed to a process the app didn't start")
	}
}

func TestWindowsCanaryHoldsInAFolderOpenToABox(t *testing.T) {
	tempHome(t)
	dir := t.TempDir()
	if code, _, errs := winRun(t, winBoxed(t, []string{dir}, "exit", "0")); code != 0 {
		t.Fatal("the box:", code, errs)
	}
	canary := filepath.Join(dir, "outside")
	if err := os.WriteFile(canary, []byte("the site must not be able to read this\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	holdCanary(canary)
	if !canaryReached(canary) {
		t.Fatal("outside the box the canary can't be reached either, so it proves nothing")
	}
	if code, _, errs := winRun(t, winBoxed(t, nil, "canary", canary)); code != winProbeNotReached {
		t.Fatalf("from the box the canary was reached: %d %s", code, errs)
	}
	if code, _, errs := winRun(t, winBoxed(t, nil, "write", filepath.Join(dir, "beside"))); code != 0 {
		t.Fatalf("the box can't write the folder that is open to it: %d %s", code, errs)
	}
}
