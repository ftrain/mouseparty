package main

import (
	"bytes"
	"crypto/x509"
	"crypto/x509/pkix"
	"debug/pe"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const updateAsset = "MouseParty-windows-x86_64-setup.exe"

const cmsgSignerCertInfoParam = 7

var (
	updateCrypt32    = windows.NewLazySystemDLL("crypt32.dll")
	cryptMsgGetParam = updateCrypt32.NewProc("CryptMsgGetParam")
	cryptMsgClose    = updateCrypt32.NewProc("CryptMsgClose")
)

func setupInstalled(root string) bool {
	st, err := os.Stat(filepath.Join(root, "uninstall.exe"))
	return err == nil && st.Mode().IsRegular()
}

func (a *App) updateExe() (string, error) {
	if a.bundlePath != "" {
		return a.bundlePath, nil
	}
	return os.Executable()
}

func (a *App) thisBundle() (string, string) {
	exe, err := a.updateExe()
	if err != nil {
		return "", "where Mouse Party is isn't known"
	}
	root := filepath.Dir(exe)
	if !setupInstalled(root) {
		return exe, "it wasn't installed by its installer"
	}
	probe, err := os.CreateTemp(root, ".mouseparty-update-")
	if err != nil {
		return exe, "it can't write to " + root + ": run the new installer from " + updatesPage
	}
	probe.Close()
	os.Remove(probe.Name())
	return exe, ""
}

func (a *App) updateByHand() string {
	if exe, err := a.updateExe(); err == nil && setupInstalled(filepath.Dir(exe)) {
		return ""
	}
	return "get its installer from " + updatesPage
}

func authenticodeName(c *x509.Certificate) string {
	name := pkix.Name{CommonName: c.Subject.CommonName, Organization: c.Subject.Organization}.String()
	if name == "" {
		name = c.Subject.String()
	}
	return name
}

func authenticodeSigner(path string) (string, error) {
	file, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return "", err
	}
	var encoding, content, format uint32
	var store, msg windows.Handle
	err = windows.CryptQueryObject(windows.CERT_QUERY_OBJECT_FILE, unsafe.Pointer(file),
		windows.CERT_QUERY_CONTENT_FLAG_PKCS7_SIGNED_EMBED, windows.CERT_QUERY_FORMAT_FLAG_BINARY, 0,
		&encoding, &content, &format, &store, &msg, nil)
	if errors.Is(err, windows.Errno(windows.CRYPT_E_NO_MATCH)) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	defer windows.CertCloseStore(store, 0)
	defer cryptMsgClose.Call(uintptr(msg))
	var size uint32
	if ok, _, err := cryptMsgGetParam.Call(uintptr(msg), cmsgSignerCertInfoParam, 0, 0, uintptr(unsafe.Pointer(&size))); ok == 0 {
		return "", err
	}
	if size == 0 {
		return "", errors.New("its signature names no signer")
	}
	info := make([]uint64, (size+7)/8)
	if ok, _, err := cryptMsgGetParam.Call(uintptr(msg), cmsgSignerCertInfoParam, 0, uintptr(unsafe.Pointer(&info[0])), uintptr(unsafe.Pointer(&size))); ok == 0 {
		return "", err
	}
	cert, err := windows.CertFindCertificateInStore(store, encoding, 0, windows.CERT_FIND_SUBJECT_CERT, unsafe.Pointer(&info[0]), nil)
	if err != nil {
		return "", err
	}
	defer windows.CertFreeCertificateContext(cert)
	c, err := x509.ParseCertificate(bytes.Clone(unsafe.Slice(cert.EncodedCert, cert.Length)))
	if err != nil {
		return "", err
	}
	return authenticodeName(c), nil
}

func authenticodeTrusted(path string) error {
	file, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	data := &windows.WinTrustData{
		Size:             uint32(unsafe.Sizeof(windows.WinTrustData{})),
		UIChoice:         windows.WTD_UI_NONE,
		RevocationChecks: windows.WTD_REVOKE_NONE,
		UnionChoice:      windows.WTD_CHOICE_FILE,
		StateAction:      windows.WTD_STATEACTION_VERIFY,
		FileOrCatalogOrBlobOrSgnrOrCert: unsafe.Pointer(&windows.WinTrustFileInfo{
			Size:     uint32(unsafe.Sizeof(windows.WinTrustFileInfo{})),
			FilePath: file,
		}),
	}
	err = windows.WinVerifyTrustEx(windows.InvalidHWND, &windows.WINTRUST_ACTION_GENERIC_VERIFY_V2, data)
	data.StateAction = windows.WTD_STATEACTION_CLOSE
	windows.WinVerifyTrustEx(windows.InvalidHWND, &windows.WINTRUST_ACTION_GENERIC_VERIFY_V2, data)
	return err
}

func checkInstaller(path, team string) string {
	f, err := pe.Open(path)
	if err != nil {
		return "it isn't an installer (it isn't a Windows program)"
	}
	f.Close()
	if team == "" {
		return ""
	}
	if err := authenticodeTrusted(path); err != nil {
		return "its signature doesn't check: " + err.Error()
	}
	if who, err := authenticodeSigner(path); err != nil || who != team {
		return "it isn't signed by Mouse Party's developer (" + team + ")"
	}
	return ""
}

func fetchUpdate(rel *release, bundle string, step func(got, total int64)) (string, error) {
	team, err := authenticodeSigner(bundle)
	if err != nil {
		return "", fmt.Errorf("who signed this Mouse Party isn't known: %v", err)
	}
	got, err := fetchUpdateAsset(rel, step)
	if err != nil {
		return "", err
	}
	if why := checkInstaller(got, team); why != "" {
		os.RemoveAll(filepath.Dir(got))
		return "", errors.New(why)
	}
	return got, nil
}

func installerLine(installer, root string, restart bool) string {
	line := syscall.EscapeArg(installer) + " /S"
	if restart {
		line += " /R"
	}
	return line + " /D=" + root
}

func startInstaller(installer, line string, breakaway bool) error {
	cmd := exec.Command(installer)
	procAttr(cmd).CmdLine = line
	detach(cmd)
	if !breakaway {
		procAttr(cmd).CreationFlags &^= windows.CREATE_BREAKAWAY_FROM_JOB
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}

func (a *App) installUpdate() error {
	u := &a.update
	if u.state != "ready" || u.staged == "" {
		return nil
	}
	bundle, why := a.thisBundle()
	if why != "" {
		return errors.New(why)
	}
	line := installerLine(u.staged, filepath.Dir(bundle), u.restart)
	if err := startInstaller(u.staged, line, true); err != nil {
		if err := startInstaller(u.staged, line, false); err != nil {
			return err
		}
	}
	a.log("Mouse Party " + u.latest + " goes in once this one has gone: its installer is running")
	u.state, u.staged = "", ""
	return nil
}

func (a *App) tidyUpdate() { a.tidyUpdateCache() }

func reopen(string) {}
