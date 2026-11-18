package main

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"syscall"

	"golang.org/x/sys/windows/registry"
)

func dataDir() string {
	dir, _ := os.UserCacheDir()
	return filepath.Join(dir, "Mouse Party")
}

func webView2Dir() string { return filepath.Join(dataDir(), "WebView2") }

func systemMonoFonts() []string {
	var fonts []string
	if windir := os.Getenv("WINDIR"); windir != "" {
		fonts = append(fonts, filepath.Join(windir, "Fonts", "DejaVuSansMono.ttf"))
	}
	if local, err := os.UserCacheDir(); err == nil {
		fonts = append(fonts, filepath.Join(local, "Microsoft", "Windows", "Fonts", "DejaVuSansMono.ttf"))
	}
	return fonts
}

func cardFontRef() (dir, file string) {
	f := cardFontFile()
	if f == "" {
		return "", ""
	}
	return filepath.Dir(f), filepath.Base(f)
}

var windowsJunk = map[string]bool{"thumbs.db": true, "desktop.ini": true, "$recycle.bin": true, "system volume information": true}

func hiddenFile(d fs.DirEntry) bool {
	if strings.HasPrefix(d.Name(), ".") || windowsJunk[strings.ToLower(d.Name())] {
		return true
	}
	info, err := d.Info()
	if err != nil {
		return false
	}
	a, ok := info.Sys().(*syscall.Win32FileAttributeData)
	return ok && a.FileAttributes&(syscall.FILE_ATTRIBUTE_HIDDEN|syscall.FILE_ATTRIBUTE_SYSTEM) != 0
}

func playingKey(path string) string { return strings.ToLower(filepath.Clean(path)) }

func toolHint(string) string { return "reinstall Mouse Party" }

func relaunchTarget() string {
	exe, _ := os.Executable()
	return exe
}

func webviewFolders() []string {
	dirs := []string{webView2Dir()}
	if exe, err := os.Executable(); err == nil {
		if roaming, err := os.UserConfigDir(); err == nil {
			dirs = append(dirs, filepath.Join(roaming, filepath.Base(exe)))
		}
	}
	return dirs
}

func thenProgram() (string, error) { return os.Executable() }

func exeReplaced() bool { return false }

func unpacker() int { return 0 }

func closeInheritedFiles() {}

func eraseKey(path string) error {
	path = strings.Trim(path, `\`)
	if !ownKey(path) {
		return nil
	}
	if classID.MatchString(path[strings.LastIndex(path, `\`)+1:]) && !servedByThis(path) {
		return nil
	}
	return eraseKeyTree(registry.CURRENT_USER, path)
}

func servedByThis(class string) bool {
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	k, err := registry.OpenKey(registry.CURRENT_USER, class+`\LocalServer32`, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()
	server, _, err := k.GetStringValue("")
	return err == nil && strings.Contains(strings.ToLower(server), strings.ToLower(exe))
}

func eraseKeyTree(root registry.Key, path string) error {
	k, err := registry.OpenKey(root, path, registry.ENUMERATE_SUB_KEYS)
	if errors.Is(err, registry.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	names, err := k.ReadSubKeyNames(-1)
	k.Close()
	if err != nil {
		return err
	}
	for _, n := range names {
		if err := eraseKeyTree(root, path+`\`+n); err != nil {
			return err
		}
	}
	if err := registry.DeleteKey(root, path); err != nil && !errors.Is(err, registry.ErrNotExist) {
		return err
	}
	return nil
}

func zoneMark(zip string) func(string) {
	zone, err := os.ReadFile(zip + ":Zone.Identifier")
	if err != nil || len(zone) == 0 || len(zone) > 64<<10 {
		return func(string) {}
	}
	return func(file string) { os.WriteFile(file+":Zone.Identifier", zone, 0o644) }
}
