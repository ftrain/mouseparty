package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var isProcessInJobProc = windows.NewLazySystemDLL("kernel32.dll").NewProc("IsProcessInJob")

const goneWait = 5000

func procAttr(cmd *exec.Cmd) *syscall.SysProcAttr {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	return cmd.SysProcAttr
}

func watched(run string, argv []string) *exec.Cmd {
	cmd := exec.Command(run, argv...)
	startGroup(cmd)
	return cmd
}

func startGroup(cmd *exec.Cmd) {
	procAttr(cmd).CreationFlags |= windows.CREATE_NO_WINDOW | windows.CREATE_NEW_PROCESS_GROUP
}

func detach(cmd *exec.Cmd) {
	procAttr(cmd).CreationFlags |= windows.DETACHED_PROCESS | windows.CREATE_NEW_PROCESS_GROUP
	if mayBreakAway() {
		procAttr(cmd).CreationFlags |= windows.CREATE_BREAKAWAY_FROM_JOB
	}
}

func noConsole(cmd *exec.Cmd) { procAttr(cmd).CreationFlags |= windows.CREATE_NO_WINDOW }

func interruptGroup(cmd *exec.Cmd) { endTree(cmd) }

func killGroup(cmd *exec.Cmd) { endTree(cmd) }

func stopGroup(cmd *exec.Cmd) { endTree(cmd) }

func killBoxed(cmd *exec.Cmd) { endTree(cmd) }

func endTree(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	kids := childrenOf(cmd)
	for _, k := range kids {
		windows.TerminateProcess(k, 1)
	}
	cmd.Process.Kill()
	for _, k := range kids {
		windows.WaitForSingleObject(k, goneWait)
		windows.CloseHandle(k)
	}
	cmd.Process.WithHandle(func(h uintptr) { windows.WaitForSingleObject(windows.Handle(h), goneWait) })
}

func childrenOf(cmd *exec.Cmd) []windows.Handle {
	born := startTime(cmd)
	if born == 0 {
		return nil
	}
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil
	}
	defer windows.CloseHandle(snap)
	var kids []windows.Handle
	e := windows.ProcessEntry32{Size: uint32(unsafe.Sizeof(windows.ProcessEntry32{}))}
	for err = windows.Process32First(snap, &e); err == nil; err = windows.Process32Next(snap, &e) {
		if int(e.ParentProcessID) != cmd.Process.Pid || int(e.ProcessID) == cmd.Process.Pid {
			continue
		}
		h, openErr := windows.OpenProcess(windows.PROCESS_TERMINATE|windows.SYNCHRONIZE|windows.PROCESS_QUERY_LIMITED_INFORMATION,
			false, e.ProcessID)
		if openErr != nil {
			continue
		}
		if createdAt(h) < born {
			windows.CloseHandle(h)
			continue
		}
		kids = append(kids, h)
	}
	return kids
}

func startTime(cmd *exec.Cmd) int64 {
	var born int64
	if cmd.Process == nil || cmd.Process.WithHandle(func(h uintptr) { born = createdAt(windows.Handle(h)) }) != nil {
		return 0
	}
	return born
}

func createdAt(h windows.Handle) int64 {
	var created, exited, kernel, user windows.Filetime
	if windows.GetProcessTimes(h, &created, &exited, &kernel, &user) != nil {
		return 0
	}
	return created.Nanoseconds()
}

func parentOf(pid uint32) (uint32, bool) {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return 0, false
	}
	defer windows.CloseHandle(snap)
	e := windows.ProcessEntry32{Size: uint32(unsafe.Sizeof(windows.ProcessEntry32{}))}
	for err = windows.Process32First(snap, &e); err == nil; err = windows.Process32Next(snap, &e) {
		if e.ProcessID == pid {
			return e.ParentProcessID, true
		}
	}
	return 0, false
}

func startedBy(cmd *exec.Cmd, h windows.Handle) bool {
	pid, err := windows.GetProcessId(h)
	if err != nil || cmd.Process == nil {
		return false
	}
	if int(pid) == cmd.Process.Pid {
		return true
	}
	parent, ok := parentOf(pid)
	if !ok || int(parent) != cmd.Process.Pid {
		return false
	}
	born := startTime(cmd)
	return born != 0 && createdAt(h) >= born
}

func (h *Host) killLeftovers() {
	dirs, _ := filepath.Glob(filepath.Join(os.TempDir(), "mouseparty-host-*"))
	for _, d := range dirs {
		if sessionHeld(d) {
			continue
		}
		aside := d + ".gone"
		if os.Rename(d, aside) == nil {
			os.RemoveAll(aside)
		}
	}
}

func holdSession(dir string) (*os.File, error) {
	return os.OpenFile(filepath.Join(dir, sessionLock), os.O_RDWR|os.O_CREATE|os.O_EXCL, 0o600)
}

func sessionHeld(dir string) bool {
	path, err := windows.UTF16PtrFromString(filepath.Join(dir, sessionLock))
	if err != nil {
		return true
	}
	lock, err := windows.CreateFile(path, windows.GENERIC_READ, 0, nil, windows.OPEN_EXISTING, windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if err != nil {
		return errors.Is(err, windows.ERROR_SHARING_VIOLATION)
	}
	windows.CloseHandle(lock)
	return false
}

var appJob = sync.OnceValue(func() windows.Handle {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return 0
	}
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{BasicLimitInformation: windows.JOBOBJECT_BASIC_LIMIT_INFORMATION{
		LimitFlags: windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | windows.JOB_OBJECT_LIMIT_BREAKAWAY_OK |
			windows.JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION,
	}}
	if _, err := windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
		windows.CloseHandle(job)
		return 0
	}
	return job
})

func adopt(cmd *exec.Cmd) {
	job := appJob()
	if job == 0 || cmd.Process == nil {
		return
	}
	cmd.Process.WithHandle(func(h uintptr) { windows.AssignProcessToJobObject(job, windows.Handle(h)) })
}

func mayBreakAway() bool {
	var in int32
	if r, _, _ := isProcessInJobProc.Call(uintptr(windows.CurrentProcess()), 0, uintptr(unsafe.Pointer(&in))); r == 0 || in == 0 {
		return false
	}
	var limits windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	if windows.QueryInformationJobObject(0, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)),
		uint32(unsafe.Sizeof(limits)), nil) != nil {
		return false
	}
	return limits.BasicLimitInformation.LimitFlags&windows.JOB_OBJECT_LIMIT_BREAKAWAY_OK != 0
}

func waitGone(pid int) {
	h, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid))
	if err != nil {
		return
	}
	defer windows.CloseHandle(h)
	windows.WaitForSingleObject(h, windows.INFINITE)
}

func syscallHandle(h uintptr) syscall.Handle { return syscall.Handle(h) }
