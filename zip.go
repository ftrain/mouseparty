package main

// A zip dropped on the list is unpacked beside it, as the Finder's Archive
// Utility does (a folder of its name, or of the one folder it holds, "name 2"
// when that's taken), and the list takes what's in it that it can show, as
// from a folder. Only what's inside
// the folder is written: no path that climbs out, no link, no hidden file or
// macOS's __MACOSX leftovers, and limits on how many files and how much.

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding/charmap"
)

const (
	unzipFilesMax = 20000
	unzipBytesMax = 200 << 30 // 200 GB, a season of films; and never more than 20 times the zip (a zip bomb)
	unzipRatioMax = 20
)

// unzip: path unpacked into a new folder beside it; the folder
func unzip(path string) (string, error) {
	r, err := zip.OpenReader(path)
	if err != nil {
		return "", err
	}
	defer r.Close()
	st, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	var total uint64
	n := 0
	for _, f := range r.File {
		total += f.UncompressedSize64
		n++
	}
	if n > unzipFilesMax {
		return "", fmt.Errorf("it has over %d files", unzipFilesMax)
	}
	if total > unzipBytesMax || total > uint64(max(st.Size(), 1<<20))*unzipRatioMax {
		return "", errors.New("it would unpack to far more than it is")
	}

	// a zip of one folder is that folder, not a folder in a folder
	var entries []zipEntry
	for _, f := range r.File {
		if name, ok := zipName(f, runtime.GOOS); ok {
			entries = append(entries, zipEntry{f, name})
		}
	}
	top := ""
	for _, e := range entries {
		first, _, _ := strings.Cut(e.name, "/")
		if top == "" {
			top = first
		}
		if first != top || first == e.name && !zipDir(e.f) {
			top = "\x00" // two things at the top, or a file there
		}
	}
	base := zipFolder(path, runtime.GOOS)
	strip := ""
	if top != "" && top != "\x00" {
		base, strip = filepath.Join(filepath.Dir(path), top), top+"/"
	}
	dir := base
	for i := 2; ; i++ {
		if _, err := os.Lstat(dir); errors.Is(err, os.ErrNotExist) {
			break
		}
		dir = fmt.Sprintf("%s %d", base, i)
	}
	if err := os.Mkdir(dir, 0o755); err != nil {
		return "", err
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		return dir, err
	}
	defer root.Close()
	mark := zoneMark(path)
	var written uint64
	var clash error
	for _, e := range entries {
		if e.f.Mode()&os.ModeSymlink != 0 {
			continue
		}
		inner := strings.TrimPrefix(strings.TrimPrefix(e.name, strings.TrimSuffix(strip, "/")), "/")
		if inner == "" {
			continue // the one folder itself
		}
		rel := filepath.FromSlash(inner)
		if zipDir(e.f) {
			root.MkdirAll(rel, 0o755)
			continue
		}
		if parent := filepath.Dir(rel); parent != "." {
			if err := root.MkdirAll(parent, 0o755); err != nil {
				return dir, fmt.Errorf("%s: %w", e.f.Name, err)
			}
		}
		got, err := unzipFile(e.f, root, rel, unzipBytesMax-written)
		written += got
		switch {
		case errors.Is(err, fs.ErrExist):
			if clash == nil {
				clash = fmt.Errorf("%s: %w", e.f.Name, err)
			}
		case err != nil:
			return dir, fmt.Errorf("%s: %w", e.f.Name, err)
		default:
			mark(filepath.Join(dir, rel))
		}
	}
	return dir, clash
}

func zipFolder(path, goos string) string {
	if goos != "windows" {
		return strings.TrimSuffix(path, filepath.Ext(path))
	}
	return filepath.Join(filepath.Dir(path), safeName(strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)), true))
}

type zipEntry struct {
	f    *zip.File
	name string
}

var zipJunk = map[string]bool{"__macosx": true, "thumbs.db": true, "desktop.ini": true}

func zipName(f *zip.File, goos string) (string, bool) {
	name := f.Name
	if goos != "darwin" && !utf8.ValidString(name) {
		name, _ = charmap.CodePage437.NewDecoder().String(name)
	}
	name = strings.ReplaceAll(name, `\`, "/")
	if strings.HasPrefix(name, "/") || zipHidden(f) {
		return "", false
	}
	var parts []string
	for _, part := range strings.Split(strings.TrimSuffix(name, "/"), "/") {
		switch {
		case part == "":
			continue
		case strings.HasPrefix(part, ".") || zipJunk[strings.ToLower(part)]:
			return "", false
		}
		if goos == "windows" {
			part = safeName(part, true)
		}
		parts = append(parts, part)
	}
	return strings.Join(parts, "/"), len(parts) > 0
}

func zipDir(f *zip.File) bool { return f.FileInfo().IsDir() || strings.HasSuffix(f.Name, `\`) }

func zipHidden(f *zip.File) bool {
	switch f.CreatorVersion >> 8 {
	case 0, 10, 14:
		return f.ExternalAttrs&0x06 != 0
	}
	return false
}

// unzipFile writes one file, no more than room bytes of it (its size in the zip can be a lie)
func unzipFile(f *zip.File, root *os.Root, to string, room uint64) (uint64, error) {
	in, err := f.Open()
	if err != nil {
		return 0, err
	}
	defer in.Close()
	out, err := root.OpenFile(to, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return 0, err
	}
	n, err := io.Copy(out, io.LimitReader(in, int64(min(room, f.UncompressedSize64))+1))
	if cerr := out.Close(); err == nil {
		err = cerr
	}
	if err == nil && uint64(n) > f.UncompressedSize64 {
		err = errors.New("bigger than the zip says")
	}
	return uint64(n), err
}
