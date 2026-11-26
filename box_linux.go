package main

import (
	"debug/elf"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/net/bpf"
	"golang.org/x/sys/unix"
)

const (
	llRuleNetPort = 2

	llFSv1 = unix.LANDLOCK_ACCESS_FS_EXECUTE | unix.LANDLOCK_ACCESS_FS_WRITE_FILE | unix.LANDLOCK_ACCESS_FS_READ_FILE |
		unix.LANDLOCK_ACCESS_FS_READ_DIR | unix.LANDLOCK_ACCESS_FS_REMOVE_DIR | unix.LANDLOCK_ACCESS_FS_REMOVE_FILE |
		unix.LANDLOCK_ACCESS_FS_MAKE_CHAR | unix.LANDLOCK_ACCESS_FS_MAKE_DIR | unix.LANDLOCK_ACCESS_FS_MAKE_REG |
		unix.LANDLOCK_ACCESS_FS_MAKE_SOCK | unix.LANDLOCK_ACCESS_FS_MAKE_FIFO | unix.LANDLOCK_ACCESS_FS_MAKE_BLOCK |
		unix.LANDLOCK_ACCESS_FS_MAKE_SYM
	llFileRights = unix.LANDLOCK_ACCESS_FS_EXECUTE | unix.LANDLOCK_ACCESS_FS_WRITE_FILE | unix.LANDLOCK_ACCESS_FS_READ_FILE |
		unix.LANDLOCK_ACCESS_FS_TRUNCATE | unix.LANDLOCK_ACCESS_FS_IOCTL_DEV
	llRead  = unix.LANDLOCK_ACCESS_FS_READ_FILE | unix.LANDLOCK_ACCESS_FS_READ_DIR
	llWrite = llRead | unix.LANDLOCK_ACCESS_FS_WRITE_FILE | unix.LANDLOCK_ACCESS_FS_REMOVE_DIR |
		unix.LANDLOCK_ACCESS_FS_REMOVE_FILE | unix.LANDLOCK_ACCESS_FS_MAKE_DIR | unix.LANDLOCK_ACCESS_FS_MAKE_REG |
		unix.LANDLOCK_ACCESS_FS_MAKE_SYM | unix.LANDLOCK_ACCESS_FS_REFER | unix.LANDLOCK_ACCESS_FS_TRUNCATE
	llExec = unix.LANDLOCK_ACCESS_FS_EXECUTE | unix.LANDLOCK_ACCESS_FS_READ_FILE
)

type llNetPortAttr struct {
	allowed uint64
	port    uint64
}

func landlockABI() int {
	abi, _, errno := unix.Syscall(unix.SYS_LANDLOCK_CREATE_RULESET, 0, 0, unix.LANDLOCK_CREATE_RULESET_VERSION)
	if errno != 0 {
		return 0
	}
	return int(abi)
}

func fsRightsFor(abi int) uint64 {
	r := uint64(llFSv1)
	if abi >= 2 {
		r |= unix.LANDLOCK_ACCESS_FS_REFER
	}
	if abi >= 3 {
		r |= unix.LANDLOCK_ACCESS_FS_TRUNCATE
	}
	if abi >= 5 {
		r |= unix.LANDLOCK_ACCESS_FS_IOCTL_DEV
	}
	return r
}

type ruleset struct {
	fd       int
	fs, net  uint64
	scoped   uint64
	notBoxed []string
}

func newRuleset(spec *boxSpec) (*ruleset, error) {
	abi := landlockABI()
	if abi < 1 {
		return nil, errors.New("this Linux has no Landlock")
	}
	r := &ruleset{fs: fsRightsFor(abi)}
	if abi >= 4 {
		r.net = unix.LANDLOCK_ACCESS_NET_BIND_TCP | unix.LANDLOCK_ACCESS_NET_CONNECT_TCP
	} else {
		r.notBoxed = append(r.notBoxed, "TCP ports")
	}
	if abi >= 6 {
		r.scoped = unix.LANDLOCK_SCOPE_ABSTRACT_UNIX_SOCKET | unix.LANDLOCK_SCOPE_SIGNAL
	}
	tries := []struct{ fs, net uint64 }{
		{unix.LANDLOCK_ACCESS_FS_RESOLVE_UNIX, udpRights(spec)},
		{unix.LANDLOCK_ACCESS_FS_RESOLVE_UNIX, 0},
		{0, udpRights(spec)},
		{0, 0},
	}
	var err error
	for _, t := range tries {
		attr := unix.LandlockRulesetAttr{Handled_access_fs: r.fs | t.fs, Handled_access_net: r.net, Scoped: r.scoped}
		if r.net != 0 {
			attr.Handled_access_net |= t.net
		}
		fd, _, errno := unix.Syscall(unix.SYS_LANDLOCK_CREATE_RULESET, uintptr(unsafe.Pointer(&attr)), unsafe.Sizeof(attr), 0)
		if errno == 0 {
			r.fd, r.fs, r.net = int(fd), attr.Handled_access_fs, attr.Handled_access_net
			return r, nil
		}
		err = errno
		if errno != unix.EINVAL {
			break
		}
	}
	return nil, fmt.Errorf("Landlock: %w", err)
}

func udpRights(spec *boxSpec) uint64 {
	if spec.UDP {
		return 0
	}
	return unix.LANDLOCK_ACCESS_NET_BIND_UDP | unix.LANDLOCK_ACCESS_NET_CONNECT_SEND_UDP
}

func (r *ruleset) path(p string, access uint64) error {
	fd, err := unix.Open(p, unix.O_PATH|unix.O_CLOEXEC, 0)
	if err != nil {
		if errors.Is(err, unix.ENOENT) {
			return nil
		}
		return fmt.Errorf("%s: %w", p, err)
	}
	defer unix.Close(fd)
	var st unix.Stat_t
	if err := unix.Fstat(fd, &st); err != nil {
		return err
	}
	if st.Mode&unix.S_IFMT != unix.S_IFDIR {
		access &= llFileRights
	}
	attr := unix.LandlockPathBeneathAttr{Allowed_access: access & r.fs, Parent_fd: int32(fd)}
	if attr.Allowed_access == 0 {
		return nil
	}
	_, _, errno := unix.Syscall6(unix.SYS_LANDLOCK_ADD_RULE, uintptr(r.fd), unix.LANDLOCK_RULE_PATH_BENEATH,
		uintptr(unsafe.Pointer(&attr)), 0, 0, 0)
	if errno != 0 {
		return fmt.Errorf("%s: %w", p, errno)
	}
	return nil
}

func (r *ruleset) port(port int, access uint64) error {
	if r.net&access == 0 {
		return nil
	}
	attr := llNetPortAttr{allowed: access & r.net, port: uint64(port)}
	_, _, errno := unix.Syscall6(unix.SYS_LANDLOCK_ADD_RULE, uintptr(r.fd), llRuleNetPort,
		uintptr(unsafe.Pointer(&attr)), 0, 0, 0)
	if errno != 0 {
		return fmt.Errorf("port %d: %w", port, errno)
	}
	return nil
}

func (r *ruleset) restrict() error {
	_, _, errno := unix.Syscall(unix.SYS_LANDLOCK_RESTRICT_SELF, uintptr(r.fd), 0, 0)
	unix.Close(r.fd)
	if errno != 0 {
		return fmt.Errorf("Landlock: %w", errno)
	}
	return nil
}

var systemReads = []string{"/usr/lib64", "/usr/lib", "/lib64", "/lib", "/etc/ld.so.cache", "/etc/localtime",
	"/usr/share/zoneinfo", "/dev/null", "/dev/zero", "/dev/urandom", "/dev/random", "/sys/devices/system/cpu",
	"/sys/kernel/mm/transparent_hugepage"}

func interpreter(bin string) string {
	f, err := elf.Open(bin)
	if err != nil {
		return ""
	}
	defer f.Close()
	for _, p := range f.Progs {
		if p.Type == elf.PT_INTERP {
			b, _ := io.ReadAll(p.Open())
			return strings.TrimRight(string(b), "\x00")
		}
	}
	return ""
}

func resolved(p string) string {
	if r, err := filepath.EvalSymlinks(p); err == nil {
		return r
	}
	return p
}

func applyBox(spec *boxSpec, bin string) error {
	if err := noCoreDumps(); err != nil {
		return err
	}
	if err := keepOnly(spec.Handles); err != nil {
		return err
	}
	runtime.LockOSThread()
	if err := unix.Prctl(unix.PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0); err != nil {
		return fmt.Errorf("no_new_privs: %w", err)
	}
	r, err := newRuleset(spec)
	if err != nil {
		return err
	}
	execs := []string{bin}
	if in := interpreter(bin); in != "" {
		execs = append(execs, in)
	}
	add := func(paths []string, access uint64) error {
		for _, p := range paths {
			if p == "" {
				continue
			}
			if err := r.path(p, access); err != nil {
				return err
			}
			if rp := resolved(p); rp != p {
				if err := r.path(rp, access); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if err := add(systemReads, llRead); err != nil {
		return err
	}
	if err := add(spec.Read, llRead); err != nil {
		return err
	}
	if err := add(append([]string{"/dev/null"}, spec.Write...), llWrite); err != nil {
		return err
	}
	if err := add(execs, llExec); err != nil {
		return err
	}
	if proot := os.Getenv("PROOT_TMP_DIR"); filepath.IsAbs(proot) {
		if err := add([]string{proot}, llRead|llExec); err != nil {
			return err
		}
	}
	for _, p := range spec.ConnectTCP {
		if err := r.port(p, unix.LANDLOCK_ACCESS_NET_CONNECT_TCP); err != nil {
			return err
		}
	}
	for _, p := range spec.BindTCP {
		if err := r.port(p, unix.LANDLOCK_ACCESS_NET_BIND_TCP); err != nil {
			return err
		}
	}
	if err := r.restrict(); err != nil {
		return err
	}
	return installSeccomp(append(socketRules(spec), refusedRules()...), 0)
}

const (
	seccompArgs   = 16
	nsFlags       = unix.CLONE_NEWUSER | unix.CLONE_NEWNS | unix.CLONE_NEWNET | unix.CLONE_NEWPID | unix.CLONE_NEWIPC | unix.CLONE_NEWUTS | unix.CLONE_NEWCGROUP
	seccompAllow  = unix.SECCOMP_RET_ALLOW
	seccompKill   = unix.SECCOMP_RET_KILL_PROCESS
	sockTypeMask  = 0xf
	afNetlink     = unix.AF_NETLINK
	netlinkRoute  = unix.NETLINK_ROUTE
	errnoNoFamily = unix.SECCOMP_RET_ERRNO | uint32(unix.EAFNOSUPPORT)
	errnoDenied   = unix.SECCOMP_RET_ERRNO | uint32(unix.EPERM)
	errnoNoSys    = unix.SECCOMP_RET_ERRNO | uint32(unix.ENOSYS)
	errnoNoProto  = unix.SECCOMP_RET_ERRNO | uint32(unix.EPROTONOSUPPORT)
)

type seccompRule struct {
	nr   uint32
	body []bpf.Instruction
}

func arg(n uint32) bpf.Instruction { return bpf.LoadAbsolute{Off: seccompArgs + 8*n, Size: 4} }

func socketRules(spec *boxSpec) []seccompRule {
	udp := []bpf.Instruction{bpf.RetConstant{Val: errnoDenied}}
	if spec.UDP {
		udp = []bpf.Instruction{
			arg(2),
			bpf.JumpIf{Cond: bpf.JumpEqual, Val: 0, SkipTrue: 1},
			bpf.JumpIf{Cond: bpf.JumpEqual, Val: unix.IPPROTO_UDP, SkipFalse: 1},
			bpf.RetConstant{Val: seccompAllow},
			bpf.RetConstant{Val: errnoNoProto},
		}
	}
	inet := []bpf.Instruction{
		arg(1),
		bpf.ALUOpConstant{Op: bpf.ALUOpAnd, Val: sockTypeMask},
		bpf.JumpIf{Cond: bpf.JumpEqual, Val: unix.SOCK_STREAM, SkipFalse: 5},
		arg(2),
		bpf.JumpIf{Cond: bpf.JumpEqual, Val: 0, SkipTrue: 1},
		bpf.JumpIf{Cond: bpf.JumpEqual, Val: unix.IPPROTO_TCP, SkipFalse: 1},
		bpf.RetConstant{Val: seccompAllow},
		bpf.RetConstant{Val: errnoNoProto},
		bpf.JumpIf{Cond: bpf.JumpEqual, Val: unix.SOCK_DGRAM, SkipFalse: uint8(len(udp))},
	}
	inet = append(append(inet, udp...), bpf.RetConstant{Val: errnoDenied})
	other := []bpf.Instruction{bpf.RetConstant{Val: errnoNoFamily}}
	if spec.Netlink {
		other = []bpf.Instruction{
			bpf.JumpIf{Cond: bpf.JumpEqual, Val: afNetlink, SkipFalse: 4},
			arg(2),
			bpf.JumpIf{Cond: bpf.JumpEqual, Val: netlinkRoute, SkipFalse: 1},
			bpf.RetConstant{Val: seccompAllow},
			bpf.RetConstant{Val: errnoNoFamily},
			bpf.RetConstant{Val: errnoNoFamily},
		}
	}
	socket := []bpf.Instruction{
		arg(0),
		bpf.JumpIf{Cond: bpf.JumpEqual, Val: unix.AF_INET, SkipTrue: uint8(len(other) + 1)},
		bpf.JumpIf{Cond: bpf.JumpEqual, Val: unix.AF_INET6, SkipTrue: uint8(len(other))},
	}
	socket = append(append(socket, other...), inet...)
	clone := []bpf.Instruction{
		arg(0),
		bpf.ALUOpConstant{Op: bpf.ALUOpAnd, Val: nsFlags},
		bpf.JumpIf{Cond: bpf.JumpEqual, Val: 0, SkipFalse: 1},
		bpf.RetConstant{Val: seccompAllow},
		bpf.RetConstant{Val: errnoDenied},
	}
	return []seccompRule{
		{unix.SYS_SOCKET, socket},
		{unix.SYS_CLONE, clone},
		{unix.SYS_CLONE3, []bpf.Instruction{bpf.RetConstant{Val: errnoNoSys}}},
		{unix.SYS_UNSHARE, []bpf.Instruction{bpf.RetConstant{Val: errnoDenied}}},
		{unix.SYS_SETNS, []bpf.Instruction{bpf.RetConstant{Val: errnoDenied}}},
		{unix.SYS_IO_URING_SETUP, []bpf.Instruction{bpf.RetConstant{Val: errnoDenied}}},
	}
}

var (
	changesByPath = []uint32{unix.SYS_CHMOD, unix.SYS_FCHMODAT, unix.SYS_FCHMODAT2, unix.SYS_CHOWN, unix.SYS_LCHOWN,
		unix.SYS_FCHOWNAT, unix.SYS_UTIME, unix.SYS_UTIMES, unix.SYS_FUTIMESAT, unix.SYS_SETXATTR, unix.SYS_LSETXATTR,
		unix.SYS_SETXATTRAT, unix.SYS_REMOVEXATTR, unix.SYS_LREMOVEXATTR, unix.SYS_REMOVEXATTRAT, unix.SYS_FILE_SETATTR}
	keyringsAndSysVIPC = []uint32{unix.SYS_KEYCTL, unix.SYS_ADD_KEY, unix.SYS_REQUEST_KEY, unix.SYS_SHMGET, unix.SYS_SHMAT,
		unix.SYS_SHMCTL, unix.SYS_MSGGET, unix.SYS_MSGSND, unix.SYS_MSGRCV, unix.SYS_MSGCTL, unix.SYS_SEMGET, unix.SYS_SEMOP,
		unix.SYS_SEMTIMEDOP, unix.SYS_SEMCTL}
)

func refusedRules() []seccompRule {
	rules := []seccompRule{{unix.SYS_UTIMENSAT, deniedUnlessNull(1)}}
	for _, nr := range slices.Concat(changesByPath, keyringsAndSysVIPC) {
		rules = append(rules, seccompRule{nr, []bpf.Instruction{bpf.RetConstant{Val: errnoDenied}}})
	}
	return rules
}

func deniedUnlessNull(n uint32) []bpf.Instruction {
	return []bpf.Instruction{
		arg(n),
		bpf.JumpIf{Cond: bpf.JumpEqual, Val: 0, SkipFalse: 3},
		bpf.LoadAbsolute{Off: seccompArgs + 8*n + 4, Size: 4},
		bpf.JumpIf{Cond: bpf.JumpEqual, Val: 0, SkipFalse: 1},
		bpf.RetConstant{Val: seccompAllow},
		bpf.RetConstant{Val: errnoDenied},
	}
}

func noExecRules() []seccompRule {
	return []seccompRule{
		{unix.SYS_EXECVE, []bpf.Instruction{bpf.RetConstant{Val: errnoDenied}}},
		{unix.SYS_EXECVEAT, []bpf.Instruction{bpf.RetConstant{Val: errnoDenied}}},
	}
}

func seccompProgram(rules []seccompRule) ([]unix.SockFilter, error) {
	prog := []bpf.Instruction{
		bpf.LoadAbsolute{Off: 4, Size: 4},
		bpf.JumpIf{Cond: bpf.JumpEqual, Val: unix.AUDIT_ARCH_X86_64, SkipTrue: 1},
		bpf.RetConstant{Val: seccompKill},
		bpf.LoadAbsolute{Off: 0, Size: 4},
		bpf.JumpIf{Cond: bpf.JumpGreaterOrEqual, Val: 0x40000000, SkipFalse: 1},
		bpf.RetConstant{Val: seccompKill},
	}
	for _, r := range rules {
		if len(r.body) > 255 {
			return nil, errors.New("seccomp rule too long")
		}
		prog = append(prog, bpf.JumpIf{Cond: bpf.JumpEqual, Val: r.nr, SkipFalse: uint8(len(r.body))})
		prog = append(prog, r.body...)
	}
	prog = append(prog, bpf.RetConstant{Val: seccompAllow})
	raw, err := bpf.Assemble(prog)
	if err != nil {
		return nil, err
	}
	out := make([]unix.SockFilter, len(raw))
	for i, in := range raw {
		out[i] = unix.SockFilter{Code: in.Op, Jt: in.Jt, Jf: in.Jf, K: in.K}
	}
	return out, nil
}

func installSeccomp(rules []seccompRule, flags uintptr) error {
	filter, err := seccompProgram(rules)
	if err != nil {
		return err
	}
	prog := unix.SockFprog{Len: uint16(len(filter)), Filter: &filter[0]}
	if _, _, errno := unix.Syscall(unix.SYS_SECCOMP, unix.SECCOMP_SET_MODE_FILTER, flags, uintptr(unsafe.Pointer(&prog))); errno != 0 {
		return fmt.Errorf("seccomp: %w", errno)
	}
	runtime.KeepAlive(filter)
	return nil
}

func boxMain(args []string) int {
	if len(args) < 3 || args[1] != "--" {
		fmt.Fprintln(os.Stderr, "usage: --box <spec> -- <program> [args...]")
		return 125
	}
	var spec boxSpec
	if err := json.Unmarshal([]byte(args[0]), &spec); err != nil {
		fmt.Fprintln(os.Stderr, "the box:", err)
		return 125
	}
	bin := args[2]
	if err := applyBox(&spec, bin); err != nil {
		fmt.Fprintln(os.Stderr, "the box:", err)
		return 125
	}
	err := syscall.Exec(bin, args[2:], boxEnv(spec.Env))
	fmt.Fprintln(os.Stderr, "the box:", err)
	return 126
}

func noCoreDumps() error {
	if err := unix.Setrlimit(unix.RLIMIT_CORE, &unix.Rlimit{}); err != nil {
		return fmt.Errorf("core dumps: %w", err)
	}
	return nil
}

func keepOnly(handed []uintptr) error {
	if unix.CloseRange(3, math.MaxUint32, unix.CLOSE_RANGE_CLOEXEC) != nil {
		if err := closeOnExecByProc(); err != nil {
			return err
		}
	}
	for _, fd := range handed {
		if _, err := unix.FcntlInt(fd, unix.F_SETFD, 0); err != nil {
			return fmt.Errorf("descriptor %d: %w", fd, err)
		}
	}
	return nil
}

func closeOnExecByProc() error {
	entries, err := os.ReadDir("/proc/self/fd")
	if err != nil {
		return fmt.Errorf("its descriptors: %w", err)
	}
	for _, e := range entries {
		if fd, err := strconv.Atoi(e.Name()); err == nil && fd > 2 {
			unix.CloseOnExec(fd)
		}
	}
	return nil
}

var boxEnvNames = []string{"PATH", "HOME", "LANG", "TZ", "TMPDIR", "TMP", "TEMP", "XDG_CACHE_HOME"}

func boxEnv(set []string) []string {
	env := slices.Clone(set)
	for _, kv := range os.Environ() {
		name, _, _ := strings.Cut(kv, "=")
		given := slices.ContainsFunc(set, func(s string) bool { return strings.HasPrefix(s, name+"=") })
		if !given && (slices.Contains(boxEnvNames, name) || strings.HasPrefix(name, "LC_")) {
			env = append(env, kv)
		}
	}
	return env
}

func noExec() error { return installSeccomp(noExecRules(), unix.SECCOMP_FILTER_FLAG_TSYNC) }

var (
	lookupReads = []string{"/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf", "/etc/host.conf", "/etc/gai.conf",
		"/run/systemd/resolve", "/etc/pki", "/etc/ssl", "/etc/ca-certificates", "/usr/share/ca-certificates"}
	fontReads = []string{"/etc/fonts", "/usr/share/fonts", "/usr/local/share/fonts", "/usr/share/X11/fonts",
		"/usr/share/fontconfig", "/var/cache/fontconfig", "/usr/lib/fontconfig"}
)

func sandboxMissing() string {
	if landlockABI() < 1 {
		return "This Linux has no Landlock (it needs 5.13 or later, with landlock among its security modules)"
	}
	if _, err := os.Executable(); err != nil {
		return "Where Mouse Party is isn't known"
	}
	return ""
}

func sandboxLimits() string {
	abi := landlockABI()
	note := "On this Linux the sandbox keeps ffmpeg, MediaMTX, cloudflared and the viewer site to their own files and from starting programs. " +
		"Their network is kept to their ports, but on any address, not only this computer's."
	if abi < 4 {
		note = "On this Linux the sandbox keeps ffmpeg, MediaMTX, cloudflared and the viewer site to their own files and from starting programs, " +
			"but its Landlock is too old to keep them to their network ports (that needs Linux 6.7 or later)."
	}
	if abi < 6 {
		note += " Nor can it keep them from signalling other programs, Mouse Party too (that needs Linux 6.12 or later)."
	}
	return note
}
