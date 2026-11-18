package main

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"unsafe"

	"golang.org/x/sys/unix"
)

func init() {
	asSubreaper = func(t *testing.T) {
		if err := unix.Prctl(unix.PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { unix.Prctl(unix.PR_SET_CHILD_SUBREAPER, 0, 0, 0, 0) })
	}
	probeOps["userns"] = probeOp{0, func([]string) error { return unix.Unshare(unix.CLONE_NEWUSER) }}
	probeOps["iouring"] = probeOp{0, func([]string) error {
		var params [120]byte
		fd, _, errno := unix.Syscall(unix.SYS_IO_URING_SETUP, 1, uintptr(unsafe.Pointer(&params[0])), 0)
		if errno != 0 {
			return errno
		}
		return unix.Close(int(fd))
	}}
	probeOps["mptcp"] = probeOp{0, func([]string) error { return socketCloses(unix.AF_INET, unix.SOCK_STREAM, unix.IPPROTO_MPTCP) }}
	probeOps["netlink"] = probeOp{0, func([]string) error { return socketCloses(unix.AF_NETLINK, unix.SOCK_RAW, unix.NETLINK_ROUTE) }}
	probeOps["icmp"] = probeOp{0, func([]string) error { return socketCloses(unix.AF_INET, unix.SOCK_DGRAM, unix.IPPROTO_ICMP) }}
	probeOps["chmod"] = probeOp{1, chmodEveryWay}
	probeOps["chown"] = probeOp{1, chownEveryWay}
	probeOps["times"] = probeOp{1, timesEveryWay}
	probeOps["xattr"] = probeOp{1, xattrEveryWay}
	probeOps["futimens"] = probeOp{1, probeFutimens}
	probeOps["keyctl"] = probeOp{0, func([]string) error {
		return errnoOf(unix.Syscall(unix.SYS_KEYCTL, unix.KEYCTL_JOIN_SESSION_KEYRING, 0, 0))
	}}
	probeOps["shmget"] = probeOp{0, func([]string) error {
		id, err := unix.SysvShmGet(unix.IPC_PRIVATE, 4096, unix.IPC_CREAT|0o600)
		if err == nil {
			unix.SysvShmCtl(id, unix.IPC_RMID, nil)
		}
		return err
	}}
}

func socketCloses(family, kind, proto int) error {
	fd, err := unix.Socket(family, kind, proto)
	if err == nil {
		unix.Close(fd)
	}
	return err
}

var atCWD = unix.AT_FDCWD

func errnoOf(_, _ uintptr, errno unix.Errno) error {
	if errno != 0 {
		return errno
	}
	return nil
}

type way struct {
	call string
	err  error
}

func everyWay(ways ...way) error {
	var did, refused []string
	var why error
	for _, w := range ways {
		switch {
		case w.err == nil:
			did = append(did, w.call)
		case errors.Is(w.err, unix.ENOSYS):
		case refusal(w.err):
			refused, why = append(refused, w.call), w.err
		default:
			return fmt.Errorf("%s: %w", w.call, w.err)
		}
	}
	if len(did) > 0 && len(refused) > 0 {
		return fmt.Errorf("%s did it, %s refused (%v)", strings.Join(did, ", "), strings.Join(refused, ", "), why)
	}
	return why
}

func pathAndStat(path string) (*byte, *unix.Stat_t, error) {
	p, err := unix.BytePtrFromString(path)
	if err != nil {
		return nil, nil, err
	}
	var st unix.Stat_t
	return p, &st, unix.Stat(path, &st)
}

func chmodEveryWay(a []string) error {
	p, st, err := pathAndStat(a[0])
	if err != nil {
		return err
	}
	mode := uintptr(st.Mode & 0o7777)
	return everyWay(
		way{"chmod", errnoOf(unix.Syscall(unix.SYS_CHMOD, uintptr(unsafe.Pointer(p)), mode, 0))},
		way{"fchmodat", errnoOf(unix.Syscall6(unix.SYS_FCHMODAT, uintptr(atCWD), uintptr(unsafe.Pointer(p)), mode, 0, 0, 0))},
		way{"fchmodat2", errnoOf(unix.Syscall6(unix.SYS_FCHMODAT2, uintptr(atCWD), uintptr(unsafe.Pointer(p)), mode, 0, 0, 0))},
	)
}

func chownEveryWay(a []string) error {
	p, err := unix.BytePtrFromString(a[0])
	if err != nil {
		return err
	}
	uid, gid := uintptr(os.Getuid()), uintptr(os.Getgid())
	return everyWay(
		way{"chown", errnoOf(unix.Syscall(unix.SYS_CHOWN, uintptr(unsafe.Pointer(p)), uid, gid))},
		way{"lchown", errnoOf(unix.Syscall(unix.SYS_LCHOWN, uintptr(unsafe.Pointer(p)), uid, gid))},
		way{"fchownat", errnoOf(unix.Syscall6(unix.SYS_FCHOWNAT, uintptr(atCWD), uintptr(unsafe.Pointer(p)), uid, gid, 0, 0))},
	)
}

func timesEveryWay(a []string) error {
	p, st, err := pathAndStat(a[0])
	if err != nil {
		return err
	}
	high, err := pathWithLowHalfZero(a[0])
	if err != nil {
		return err
	}
	buf := unix.Utimbuf{Actime: st.Mtim.Sec, Modtime: st.Mtim.Sec}
	tv := [2]unix.Timeval{{Sec: st.Mtim.Sec}, {Sec: st.Mtim.Sec}}
	ts := [2]unix.Timespec{st.Mtim, st.Mtim}
	return everyWay(
		way{"utime", errnoOf(unix.Syscall(unix.SYS_UTIME, uintptr(unsafe.Pointer(p)), uintptr(unsafe.Pointer(&buf)), 0))},
		way{"utimes", errnoOf(unix.Syscall(unix.SYS_UTIMES, uintptr(unsafe.Pointer(p)), uintptr(unsafe.Pointer(&tv)), 0))},
		way{"futimesat", errnoOf(unix.Syscall(unix.SYS_FUTIMESAT, uintptr(atCWD), uintptr(unsafe.Pointer(p)), uintptr(unsafe.Pointer(&tv))))},
		way{"utimensat", errnoOf(unix.Syscall6(unix.SYS_UTIMENSAT, uintptr(atCWD), uintptr(unsafe.Pointer(p)), uintptr(unsafe.Pointer(&ts)), 0, 0, 0))},
		way{"utimensat with the path at an address whose low 32 bits are 0", errnoOf(unix.Syscall6(unix.SYS_UTIMENSAT, uintptr(atCWD), high, uintptr(unsafe.Pointer(&ts)), 0, 0, 0))},
	)
}

func pathWithLowHalfZero(path string) (uintptr, error) {
	fd, err := unix.MemfdCreate("path", unix.MFD_CLOEXEC)
	if err != nil {
		return 0, err
	}
	defer unix.Close(fd)
	if _, err := unix.Write(fd, append([]byte(path), 0)); err != nil {
		return 0, err
	}
	const at = 0x5a5a00000000
	addr, _, errno := unix.Syscall6(unix.SYS_MMAP, at, uintptr(len(path)+1), unix.PROT_READ, unix.MAP_SHARED|unix.MAP_FIXED_NOREPLACE, uintptr(fd), 0)
	if errno != 0 {
		return 0, errno
	}
	if addr != at {
		return 0, fmt.Errorf("the path was mapped at %#x", addr)
	}
	return addr, nil
}

func xattrEveryWay(a []string) error {
	const name, value = "user.mouseparty", "x"
	p, err := unix.BytePtrFromString(a[0])
	if err != nil {
		return err
	}
	n, err := unix.BytePtrFromString(name)
	if err != nil {
		return err
	}
	args := struct {
		value       uint64
		size, flags uint32
	}{uint64(uintptr(unsafe.Pointer(unsafe.StringData(value)))), uint32(len(value)), 0}
	return everyWay(
		way{"setxattr", unix.Setxattr(a[0], name, []byte(value), 0)},
		way{"removexattr", unix.Removexattr(a[0], name)},
		way{"lsetxattr", unix.Lsetxattr(a[0], name, []byte(value), 0)},
		way{"lremovexattr", unix.Lremovexattr(a[0], name)},
		way{"setxattrat", errnoOf(unix.Syscall6(unix.SYS_SETXATTRAT, uintptr(atCWD), uintptr(unsafe.Pointer(p)), 0,
			uintptr(unsafe.Pointer(n)), uintptr(unsafe.Pointer(&args)), unsafe.Sizeof(args)))},
		way{"removexattrat", errnoOf(unix.Syscall6(unix.SYS_REMOVEXATTRAT, uintptr(atCWD), uintptr(unsafe.Pointer(p)), 0,
			uintptr(unsafe.Pointer(n)), 0, 0))},
	)
}

func probeFutimens(a []string) error {
	f, err := os.OpenFile(a[0], os.O_WRONLY, 0)
	if err != nil {
		return err
	}
	defer f.Close()
	var st unix.Stat_t
	if err := unix.Fstat(int(f.Fd()), &st); err != nil {
		return err
	}
	ts := [2]unix.Timespec{st.Mtim, st.Mtim}
	return errnoOf(unix.Syscall6(unix.SYS_UTIMENSAT, f.Fd(), 0, uintptr(unsafe.Pointer(&ts)), 0, 0, 0))
}
