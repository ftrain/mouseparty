package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	createRestrictedTokenProc = windows.NewLazySystemDLL("advapi32.dll").NewProc("CreateRestrictedToken")
	peekMessageProc           = windows.NewLazySystemDLL("user32.dll").NewProc("PeekMessageW")
)

const (
	disableMaxPrivilege     = 0x1
	procThreadAttributeJobs = 0x0002000d
	lowIntegrityLabel       = "S:(ML;;NW;;;LW)"
	mediumIntegrityLabel    = "S:(ML;;NW;;;ME)"
	boxSetupFailed          = 125
	boxStartFailed          = 126
	boxLimitFlags           = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | windows.JOB_OBJECT_LIMIT_ACTIVE_PROCESS |
		windows.JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION
	boxUILimits = windows.JOB_OBJECT_UILIMIT_DESKTOP | windows.JOB_OBJECT_UILIMIT_DISPLAYSETTINGS |
		windows.JOB_OBJECT_UILIMIT_EXITWINDOWS | windows.JOB_OBJECT_UILIMIT_GLOBALATOMS | windows.JOB_OBJECT_UILIMIT_HANDLES |
		windows.JOB_OBJECT_UILIMIT_READCLIPBOARD | windows.JOB_OBJECT_UILIMIT_SYSTEMPARAMETERS |
		windows.JOB_OBJECT_UILIMIT_WRITECLIPBOARD
	boxNestedNote = "the box: Windows would not start this program in a job of its own with window and clipboard limits, " +
		"so it is not kept from the clipboard or other windows"
	startfForceOffFeedback = 0x80
)

func boxMain(args []string) int {
	endStartingCursor()
	if len(args) < 3 || args[1] != "--" {
		fmt.Fprintln(os.Stderr, "usage: --box <spec> -- <program> [args...]")
		return boxSetupFailed
	}
	var spec boxSpec
	if err := json.Unmarshal([]byte(args[0]), &spec); err != nil {
		fmt.Fprintln(os.Stderr, "the box:", err)
		return boxSetupFailed
	}
	code, err := runBoxed(&spec, args[2], args[3:])
	if err != nil {
		fmt.Fprintln(os.Stderr, "the box:", err)
	}
	return code
}

func endStartingCursor() {
	if peekMessageProc.Find() != nil {
		return
	}
	var msg [6]uint64
	peekMessageProc.Call(uintptr(unsafe.Pointer(&msg[0])), 0, 0, 0, 0)
}

func runBoxed(spec *boxSpec, bin string, args []string) (int, error) {
	app, err := openApp(spec.App)
	if err != nil {
		return boxSetupFailed, err
	}
	temp, err := openToBox(spec.Write)
	if err != nil {
		return boxSetupFailed, err
	}
	set := spec.Env
	if temp != "" {
		set = append(slices.Clone(spec.Env), "TMP="+temp, "TEMP="+temp)
	}
	env, err := envBlock(boxEnv(set, os.Environ()))
	if err != nil {
		return boxSetupFailed, fmt.Errorf("its environment: %w", err)
	}
	token, err := boxToken()
	if err != nil {
		return boxSetupFailed, err
	}
	defer token.Close()
	stdio, err := boxStdio()
	if err != nil {
		return boxSetupFailed, err
	}
	defer closeHandles(stdio[:])
	given, err := boxInherited(spec.Handles)
	if err != nil {
		return boxSetupFailed, err
	}
	process, job, err := startBoxed(token, bin, args, env, stdio, given)
	closeHandles(given)
	if err != nil {
		return boxStartFailed, err
	}
	defer windows.CloseHandle(job)
	defer windows.CloseHandle(process)
	if app != 0 {
		go func() {
			windows.WaitForSingleObject(app, windows.INFINITE)
			windows.TerminateJobObject(job, 1)
			os.Exit(1)
		}()
	}
	if _, err := windows.WaitForSingleObject(process, windows.INFINITE); err != nil {
		windows.TerminateJobObject(job, 1)
		return boxStartFailed, err
	}
	var code uint32
	if err := windows.GetExitCodeProcess(process, &code); err != nil {
		return boxStartFailed, err
	}
	return int(code), nil
}

func openApp(pid int) (windows.Handle, error) {
	if pid == 0 {
		return 0, nil
	}
	app, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid))
	if err != nil {
		return 0, fmt.Errorf("Mouse Party has quit: %w", err)
	}
	if ev, _ := windows.WaitForSingleObject(app, 0); ev == windows.WAIT_OBJECT_0 {
		windows.CloseHandle(app)
		return 0, errors.New("Mouse Party has quit")
	}
	return app, nil
}

func openToBox(paths []string) (string, error) {
	temp, cache := realPath(os.TempDir()), wasmCacheFor(true)
	if cache != "" {
		cache = realPath(cache)
	}
	first := ""
	for _, p := range paths {
		if !mayOpenToBox(p, temp, cache) {
			return "", fmt.Errorf("%s: only Mouse Party's own temporary files and its cache are opened to a box", p)
		}
		dir, err := labelPath(p, lowIntegrityLabel)
		if errors.Is(err, windows.ERROR_FILE_NOT_FOUND) || errors.Is(err, windows.ERROR_PATH_NOT_FOUND) {
			continue
		}
		if err != nil {
			return "", fmt.Errorf("%s: %w", p, err)
		}
		if dir && first == "" {
			first = p
		}
	}
	return first, nil
}

func mayOpenToBox(path, temp, cache string) bool {
	if !filepath.IsAbs(path) {
		return false
	}
	if rel, ok := under(path, temp); ok && rel != "." {
		return true
	}
	if cache == "" {
		return false
	}
	_, ok := under(path, cache)
	return ok
}

func under(path, root string) (string, bool) {
	rel, err := filepath.Rel(root, path)
	if err != nil || filepath.IsAbs(rel) || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", false
	}
	return rel, true
}

func labelPath(path, sddl string) (bool, error) {
	name, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return false, err
	}
	h, err := windows.CreateFile(name, windows.READ_CONTROL|windows.WRITE_OWNER,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE, nil, windows.OPEN_EXISTING,
		windows.FILE_FLAG_BACKUP_SEMANTICS|windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if err != nil {
		return false, err
	}
	defer windows.CloseHandle(h)
	var info windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(h, &info); err != nil {
		return false, err
	}
	if info.FileAttributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
		return false, errors.New("it is a link, and a box is never opened through one")
	}
	sd, err := windows.SecurityDescriptorFromString(sddl)
	if err != nil {
		return false, err
	}
	if err := windows.SetKernelObjectSecurity(h, windows.LABEL_SECURITY_INFORMATION, sd); err != nil {
		return false, err
	}
	return info.FileAttributes&windows.FILE_ATTRIBUTE_DIRECTORY != 0, nil
}

func boxToken() (windows.Token, error) {
	var own windows.Token
	access := uint32(windows.TOKEN_DUPLICATE | windows.TOKEN_QUERY | windows.TOKEN_ADJUST_DEFAULT | windows.TOKEN_ASSIGN_PRIMARY)
	if err := windows.OpenProcessToken(windows.CurrentProcess(), access, &own); err != nil {
		return 0, fmt.Errorf("its token: %w", err)
	}
	defer own.Close()
	admins, err := windows.CreateWellKnownSid(windows.WinBuiltinAdministratorsSid)
	if err != nil {
		return 0, err
	}
	denied := []windows.SIDAndAttributes{{Sid: admins}}
	var restricted windows.Token
	r, _, err := createRestrictedTokenProc.Call(uintptr(own), disableMaxPrivilege, uintptr(len(denied)),
		uintptr(unsafe.Pointer(&denied[0])), 0, 0, 0, 0, uintptr(unsafe.Pointer(&restricted)))
	runtime.KeepAlive(denied)
	if r == 0 {
		return 0, fmt.Errorf("a restricted token: %w", err)
	}
	low, err := windows.CreateWellKnownSid(windows.WinLowLabelSid)
	if err != nil {
		restricted.Close()
		return 0, err
	}
	label := windows.Tokenmandatorylabel{Label: windows.SIDAndAttributes{Sid: low, Attributes: windows.SE_GROUP_INTEGRITY}}
	if err := windows.SetTokenInformation(restricted, windows.TokenIntegrityLevel, (*byte)(unsafe.Pointer(&label)),
		label.Size()); err != nil {
		restricted.Close()
		return 0, fmt.Errorf("low integrity: %w", err)
	}
	return restricted, nil
}

func boxStdio() ([3]windows.Handle, error) {
	var std [3]windows.Handle
	for i, which := range []uint32{windows.STD_INPUT_HANDLE, windows.STD_OUTPUT_HANDLE, windows.STD_ERROR_HANDLE} {
		h, err := windows.GetStdHandle(which)
		if err != nil || h == 0 || h == windows.InvalidHandle {
			continue
		}
		if err := windows.DuplicateHandle(windows.CurrentProcess(), h, windows.CurrentProcess(), &std[i], 0, true,
			windows.DUPLICATE_SAME_ACCESS); err != nil {
			closeHandles(std[:])
			return [3]windows.Handle{}, fmt.Errorf("its standard handles: %w", err)
		}
	}
	return std, nil
}

func boxInherited(handles []uintptr) ([]windows.Handle, error) {
	var given []windows.Handle
	for _, v := range handles {
		h := windows.Handle(v)
		if h == 0 || h == windows.InvalidHandle || slices.Contains(given, h) {
			continue
		}
		if err := windows.SetHandleInformation(h, windows.HANDLE_FLAG_INHERIT, windows.HANDLE_FLAG_INHERIT); err != nil {
			return nil, fmt.Errorf("handle %d: %w", v, err)
		}
		given = append(given, h)
	}
	return given, nil
}

func closeHandles(handles []windows.Handle) {
	for _, h := range handles {
		if h != 0 {
			windows.CloseHandle(h)
		}
	}
}

var boxEnvNames = []string{"SystemRoot", "windir", "SystemDrive", "ComSpec", "PATH", "PATHEXT", "TEMP", "TMP", "USERPROFILE",
	"HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "APPDATA", "ProgramData", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432",
	"CommonProgramFiles", "CommonProgramFiles(x86)", "CommonProgramW6432", "PUBLIC", "ALLUSERSPROFILE", "OS",
	"PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER", "NUMBER_OF_PROCESSORS", "COMPUTERNAME", "USERNAME", "USERDOMAIN",
	"LANG", "TZ", siteHandles}

func boxEnv(set, environ []string) []string {
	env := map[string]string{}
	for _, kv := range environ {
		key := envKey(kv)
		if slices.ContainsFunc(boxEnvNames, func(name string) bool { return strings.ToUpper(name) == key }) {
			env[key] = kv
		}
	}
	for _, kv := range set {
		if key := envKey(kv); key != "" {
			env[key] = kv
		}
	}
	return slices.SortedFunc(maps.Values(env), func(a, b string) int { return strings.Compare(envKey(a), envKey(b)) })
}

func envKey(kv string) string {
	name, _, ok := strings.Cut(kv, "=")
	if !ok {
		return ""
	}
	return strings.ToUpper(name)
}

func envBlock(env []string) ([]uint16, error) {
	var block []uint16
	for _, kv := range env {
		s, err := windows.UTF16FromString(kv)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", envKey(kv), err)
		}
		block = append(block, s...)
	}
	if len(block) == 0 {
		block = append(block, 0)
	}
	return append(block, 0), nil
}

func startBoxed(token windows.Token, bin string, args []string, env []uint16, stdio [3]windows.Handle,
	given []windows.Handle) (windows.Handle, windows.Handle, error) {
	job, err := boxJob(true)
	if err != nil {
		return 0, 0, err
	}
	process, err := createBoxed(token, job, windows.CREATE_BREAKAWAY_FROM_JOB, bin, args, env, stdio, given)
	if err != nil {
		windows.CloseHandle(job)
		refused := err
		if job, err = boxJob(false); err != nil {
			return 0, 0, err
		}
		if process, err = createBoxed(token, job, 0, bin, args, env, stdio, given); err == nil {
			fmt.Fprintf(os.Stderr, "%s (%v)\n", boxNestedNote, refused)
		}
	}
	if err != nil {
		windows.CloseHandle(job)
		return 0, 0, fmt.Errorf("%s: %w", bin, err)
	}
	return process, job, nil
}

func boxJob(ui bool) (windows.Handle, error) {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return 0, err
	}
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{BasicLimitInformation: windows.JOBOBJECT_BASIC_LIMIT_INFORMATION{
		LimitFlags: boxLimitFlags, ActiveProcessLimit: 1}}
	if _, err := windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
		windows.CloseHandle(job)
		return 0, fmt.Errorf("its job: %w", err)
	}
	if ui {
		restrictions := windows.JOBOBJECT_BASIC_UI_RESTRICTIONS{UIRestrictionsClass: boxUILimits}
		if _, err := windows.SetInformationJobObject(job, windows.JobObjectBasicUIRestrictions,
			uintptr(unsafe.Pointer(&restrictions)), uint32(unsafe.Sizeof(restrictions))); err != nil {
			windows.CloseHandle(job)
			return 0, fmt.Errorf("its job: %w", err)
		}
	}
	return job, nil
}

func createBoxed(token windows.Token, job windows.Handle, flags uint32, bin string, args []string, env []uint16,
	stdio [3]windows.Handle, given []windows.Handle) (windows.Handle, error) {
	name, err := windows.UTF16PtrFromString(bin)
	if err != nil {
		return 0, err
	}
	line, err := windows.UTF16PtrFromString(windows.ComposeCommandLine(append([]string{bin}, args...)))
	if err != nil {
		return 0, err
	}
	var inherit []windows.Handle
	for _, h := range stdio {
		if h != 0 {
			inherit = append(inherit, h)
		}
	}
	inherit = append(inherit, given...)
	attrs, err := windows.NewProcThreadAttributeList(2)
	if err != nil {
		return 0, err
	}
	defer attrs.Delete()
	jobs := []windows.Handle{job}
	if err := attrs.Update(procThreadAttributeJobs, unsafe.Pointer(&jobs[0]), unsafe.Sizeof(jobs[0])); err != nil {
		return 0, fmt.Errorf("its job: %w", err)
	}
	if len(inherit) > 0 {
		if err := attrs.Update(windows.PROC_THREAD_ATTRIBUTE_HANDLE_LIST, unsafe.Pointer(&inherit[0]),
			uintptr(len(inherit))*unsafe.Sizeof(inherit[0])); err != nil {
			return 0, fmt.Errorf("its handles: %w", err)
		}
	}
	si := &windows.StartupInfoEx{ProcThreadAttributeList: attrs.List()}
	si.Cb = uint32(unsafe.Sizeof(*si))
	si.Flags = windows.STARTF_USESTDHANDLES | startfForceOffFeedback
	si.StdInput, si.StdOutput, si.StdErr = stdio[0], stdio[1], stdio[2]
	var pi windows.ProcessInformation
	err = windows.CreateProcessAsUser(token, name, line, nil, nil, len(inherit) > 0,
		flags|windows.EXTENDED_STARTUPINFO_PRESENT|windows.DETACHED_PROCESS|windows.CREATE_UNICODE_ENVIRONMENT, &env[0], nil,
		&si.StartupInfo, &pi)
	runtime.KeepAlive(jobs)
	runtime.KeepAlive(inherit)
	runtime.KeepAlive(env)
	if err != nil {
		return 0, err
	}
	windows.CloseHandle(pi.Thread)
	return pi.Process, nil
}

var lookupReads, fontReads []string

func sandboxMissing() string {
	if _, err := os.Executable(); err != nil {
		return "Where Mouse Party is isn't known"
	}
	return ""
}

func sandboxLimits() string {
	return "On Windows the sandbox keeps ffmpeg, MediaMTX, cloudflared and the viewer site from writing your files and settings, " +
		"starting programs, touching other windows or the clipboard, and outliving Mouse Party, but not from reading your files, " +
		"using the network, or reaching one another."
}
