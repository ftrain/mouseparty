package main

import (
	"debug/elf"
	"encoding/binary"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const updateAsset = "MouseParty-linux-x86_64.AppImage"

var rpmInstall = "/opt/mouseparty"

var appImageMachine = map[string]elf.Machine{"amd64": elf.EM_X86_64, "arm64": elf.EM_AARCH64}

func appImageOf(exe string) string {
	image, dir := os.Getenv("APPIMAGE"), os.Getenv("APPDIR")
	if image == "" || dir == "" || !filepath.IsAbs(image) {
		return ""
	}
	dir, err := filepath.EvalSymlinks(dir)
	if err != nil {
		return ""
	}
	if rel, err := filepath.Rel(dir, exe); err != nil || !filepath.IsLocal(rel) {
		return ""
	}
	image, err = filepath.EvalSymlinks(image)
	if err != nil {
		return ""
	}
	return image
}

func appImageWhy(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return "it can't be read: " + err.Error()
	}
	defer f.Close()
	var h elf.Header64
	if err := binary.Read(f, binary.LittleEndian, &h); err != nil || string(h.Ident[:4]) != elf.ELFMAG {
		return "it isn't an AppImage"
	}
	if string(h.Ident[8:11]) != "AI\x02" {
		return "it isn't an AppImage (it has no AppImage mark)"
	}
	if elf.Class(h.Ident[elf.EI_CLASS]) != elf.ELFCLASS64 || elf.Data(h.Ident[elf.EI_DATA]) != elf.ELFDATA2LSB ||
		elf.Machine(h.Machine) != appImageMachine[runtime.GOARCH] {
		return "it isn't for this computer's processor (" + elf.Machine(h.Machine).String() + ")"
	}
	end := h.Shoff + uint64(h.Shentsize)*uint64(h.Shnum)
	if h.Shnum > 0 {
		var last elf.Section64
		at := int64(h.Shoff + uint64(h.Shentsize)*uint64(h.Shnum-1))
		if err := binary.Read(io.NewSectionReader(f, at, 64), binary.LittleEndian, &last); err != nil {
			return "it isn't an AppImage (its header is cut short)"
		}
		end = max(end, last.Off+last.Size)
	}
	var magic [4]byte
	if _, err := f.ReadAt(magic[:], int64(end)); err != nil || string(magic[:]) != "hsqs" {
		return "it isn't an AppImage (it holds no app)"
	}
	return ""
}

func (a *App) thisBundle() (string, string) {
	exe, err := os.Executable()
	if err != nil {
		return "", "where Mouse Party is isn't known"
	}
	exe, _ = filepath.EvalSymlinks(exe)
	image := a.bundlePath
	if image == "" {
		image = appImageOf(exe)
	}
	if image == "" {
		return exe, "it isn't an AppImage"
	}
	if why := appImageWhy(image); why != "" {
		return image, why
	}
	probe, err := os.CreateTemp(filepath.Dir(image), ".mouseparty-update-")
	if err != nil {
		return image, "it can't write to " + filepath.Dir(image) + ": move the AppImage to a folder of yours"
	}
	probe.Close()
	os.Remove(probe.Name())
	return image, ""
}

func (a *App) updateByHand() string {
	if a.bundlePath != "" {
		return ""
	}
	exe, err := os.Executable()
	if err != nil {
		return "get it from " + updatesPage
	}
	exe, _ = filepath.EvalSymlinks(exe)
	switch {
	case appImageOf(exe) != "":
		return ""
	case strings.HasPrefix(exe, rpmInstall+string(filepath.Separator)):
		return "get its RPM from " + updatesPage + " and install it with dnf"
	}
	return "get it from " + updatesPage
}

func fetchUpdate(rel *release, bundle string, step func(got, total int64)) (string, error) {
	got, err := fetchUpdateAsset(rel, step)
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(filepath.Dir(got))
	if why := appImageWhy(got); why != "" {
		return "", errors.New(why)
	}
	mode := fs.FileMode(0o755)
	if st, err := os.Stat(bundle); err == nil {
		mode = st.Mode().Perm() | 0o100
	}
	stage := stagingDir(bundle)
	os.RemoveAll(stage)
	if err := os.Mkdir(stage, 0o700); errors.Is(err, fs.ErrExist) {
		return "", errors.New(stage + " is in the way and can't be deleted")
	} else if err != nil {
		return "", err
	}
	staged := stagedFor(bundle)
	if err := updateCopy(got, staged, mode); err != nil {
		os.RemoveAll(stage)
		return "", err
	}
	return staged, nil
}

func updateCopy(from, to string, mode fs.FileMode) error {
	in, err := os.Open(from)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(to, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, in)
	if err == nil {
		err = out.Sync()
	}
	if cerr := out.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		err = os.Chmod(to, mode)
	}
	return err
}

func stagedFor(bundle string) string {
	return filepath.Join(stagingDir(bundle), filepath.Base(bundle))
}

func (a *App) installUpdate() error {
	u := &a.update
	if u.state != "ready" || u.staged == "" {
		return nil
	}
	err := a.putUpdateIn(u.staged)
	os.RemoveAll(filepath.Dir(u.staged))
	u.state, u.staged = "", ""
	if err != nil {
		return err
	}
	a.log("Updated to Mouse Party " + u.latest)
	return nil
}

func (a *App) putUpdateIn(staged string) error {
	bundle, why := a.thisBundle()
	if why != "" {
		return errors.New(why)
	}
	if stagedFor(bundle) != staged {
		was := filepath.Join(filepath.Dir(filepath.Dir(staged)), filepath.Base(staged))
		return errors.New("it was downloaded for " + was + ", not " + bundle)
	}
	return os.Rename(staged, bundle)
}

func (a *App) tidyUpdate() {
	if !a.tidyUpdateCache() {
		return
	}
	if bundle, why := a.thisBundle(); why == "" {
		os.RemoveAll(stagingDir(bundle))
	}
}

func reopen(string) {
	if strings.HasPrefix(filepath.Base(os.Getenv("APPDIR")), "appimage_extracted_") {
		os.Setenv("APPIMAGE_EXTRACT_AND_RUN", "1")
	}
	then(relaunchTarget())
}
