package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

func TestWindowsAdoptedProgramsGoWithTheApp(t *testing.T) {
	tempHome(t)
	app := exec.Command(winExe(t), winProbeArg, "adopt")
	adopted, appGone := winStartWaiting(t, app)
	app.Process.Kill()
	appGone()
	winGone(t, adopted, 10*time.Second, "a program the app adopted outlived it")
}

func TestWindowsStopTakesTheBoxDownAndLetsGoOfItsFolder(t *testing.T) {
	tempHome(t)
	dir := t.TempDir()
	if !sandboxing() {
		t.Fatal("the sandbox is off here:", sandboxMissing())
	}
	run, argv := newBox(winExe(t)).write(dir).argv(winProbeArg, "wait")
	cmd := watched(run, argv)
	cmd.Dir = dir
	inside, wait := winStartWaiting(t, cmd)
	adopt(cmd)
	stopGroup(cmd)
	winGone(t, inside, 0, "the program in the box is still running after stopGroup")
	wait()
	if err := os.RemoveAll(dir); err != nil {
		t.Fatal("its folder is still held:", err)
	}
}

func TestWindowsLeftoverFoldersGoButNotOnesInUse(t *testing.T) {
	tempHome(t)
	tmp := t.TempDir()
	t.Setenv("TMP", tmp)
	t.Setenv("TEMP", tmp)
	stale := filepath.Join(tmp, "mouseparty-host-stale")
	busy := filepath.Join(tmp, "mouseparty-host-busy")
	for _, d := range []string{filepath.Join(stale, "site"), busy} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(stale, "mediamtx.yml"), []byte("logLevel: warn\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(winExe(t), winProbeArg, "wait")
	cmd.Dir = busy
	_, wait := winStartWaiting(t, cmd)
	(&Host{Log: func(s string) { t.Log(s) }}).killLeftovers()
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Error("a crashed session's folder is still there:", err)
	}
	if _, err := os.Stat(busy); err != nil {
		t.Error("a folder in use was taken:", err)
	}
	cmd.Process.Kill()
	wait()
}

func TestWindowsDetachedHelpersLeaveOnlyAJobThatLetsThemGo(t *testing.T) {
	cmd := exec.Command(winExe(t), winProbeArg, "exit", "0")
	detach(cmd)
	flags := cmd.SysProcAttr.CreationFlags
	if flags&windows.DETACHED_PROCESS == 0 {
		t.Fatal("not detached")
	}
	var in int32
	if r, _, err := isProcessInJobProc.Call(uintptr(windows.CurrentProcess()), 0, uintptr(unsafe.Pointer(&in))); r == 0 {
		t.Fatal(err)
	}
	if in == 0 && flags&windows.CREATE_BREAKAWAY_FROM_JOB != 0 {
		t.Fatal("asks to break away from a job it isn't in")
	}
	if err := cmd.Run(); err != nil {
		t.Fatal("a detached helper didn't start:", err)
	}
}

func TestWindowsDetachedHelpersStartWhetherOrNotTheJobLetsThemGo(t *testing.T) {
	tempHome(t)
	for _, lets := range []bool{false, true} {
		job := winJob(t, lets)
		cmd := exec.Command(winExe(t), winProbeArg, "detach")
		if mayBreakAway() {
			procAttr(cmd).CreationFlags |= windows.CREATE_BREAKAWAY_FROM_JOB
		}
		in, err := cmd.StdinPipe()
		if err != nil {
			t.Fatal(err)
		}
		helper, wait := winStartWaitingAfter(t, cmd, func() {
			var assigned error
			if err := cmd.Process.WithHandle(func(h uintptr) {
				assigned = windows.AssignProcessToJobObject(job, windows.Handle(h))
			}); err != nil {
				t.Fatal(err)
			}
			if assigned != nil {
				t.Fatalf("the helper's parent couldn't be put in a job of the test's own (%v). %s. Windows puts a process that is "+
					"already in a job into another only if neither job has window limits; Mouse Party's boxes rely on the same "+
					"wherever the app's job won't let them break away", assigned, winOwnJob())
			}
			if _, err := in.Write([]byte("go\n")); err != nil {
				t.Fatal(err)
			}
		})
		var inJob int32
		if r, _, err := isProcessInJobProc.Call(uintptr(helper), uintptr(job), uintptr(unsafe.Pointer(&inJob))); r == 0 {
			t.Fatal(err)
		}
		if lets && inJob != 0 {
			t.Error("a detached helper stayed in a job that lets what it starts go")
		}
		if !lets && inJob == 0 {
			t.Error("a detached helper left a job that keeps what it starts")
		}
		if err := wait(); err != nil {
			t.Errorf("what started the helper, in a job that lets what it starts go (%v), failed: %v", lets, err)
		}
	}
}

func winJob(t *testing.T, letsGo bool) windows.Handle {
	t.Helper()
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { windows.CloseHandle(job) })
	flags := uint32(windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE)
	if letsGo {
		flags |= windows.JOB_OBJECT_LIMIT_BREAKAWAY_OK
	}
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{BasicLimitInformation: windows.JOBOBJECT_BASIC_LIMIT_INFORMATION{
		LimitFlags: flags}}
	if _, err := windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
		t.Fatal(err)
	}
	return job
}

func winOwnJob() string {
	var in int32
	if r, _, err := isProcessInJobProc.Call(uintptr(windows.CurrentProcess()), 0, uintptr(unsafe.Pointer(&in))); r == 0 {
		return fmt.Sprintf("Whether the test runs in a job isn't known (%v)", err)
	}
	if in == 0 {
		return "The test runs in no job"
	}
	var limits windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	var ui windows.JOBOBJECT_BASIC_UI_RESTRICTIONS
	if err := errors.Join(
		windows.QueryInformationJobObject(0, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)),
			uint32(unsafe.Sizeof(limits)), nil),
		windows.QueryInformationJobObject(0, windows.JobObjectBasicUIRestrictions, uintptr(unsafe.Pointer(&ui)),
			uint32(unsafe.Sizeof(ui)), nil)); err != nil {
		return fmt.Sprintf("The test runs in a job whose limits can't be read (%v)", err)
	}
	flags := limits.BasicLimitInformation.LimitFlags
	return fmt.Sprintf("The test runs in a job with limits %#x (what it starts may break away: %v) and window limits %#x",
		flags, flags&windows.JOB_OBJECT_LIMIT_BREAKAWAY_OK != 0, ui.UIRestrictionsClass)
}
