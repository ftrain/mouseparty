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
	"os"
	"path/filepath"
	"strings"
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
	top := ""
	for _, f := range r.File {
		name := strings.TrimSuffix(f.Name, "/")
		if !keepInZip(name) {
			continue
		}
		first, _, _ := strings.Cut(name, "/")
		if top == "" {
			top = first
		}
		if first != top || first == name && !f.FileInfo().IsDir() {
			top = "\x00" // two things at the top, or a file there
		}
	}
	base := strings.TrimSuffix(path, filepath.Ext(path))
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
	var written uint64
	for _, f := range r.File {
		name := strings.TrimSuffix(f.Name, "/")
		if !keepInZip(name) || f.Mode()&os.ModeSymlink != 0 {
			continue
		}
		inner := strings.TrimPrefix(name, strings.TrimSuffix(strip, "/"))
		inner = strings.TrimPrefix(inner, "/")
		if inner == "" {
			continue // the one folder itself
		}
		to := filepath.Join(dir, filepath.FromSlash(inner))
		if f.FileInfo().IsDir() {
			os.MkdirAll(to, 0o755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(to), 0o755); err != nil {
			return dir, err
		}
		got, err := unzipFile(f, to, unzipBytesMax-written)
		written += got
		if err != nil {
			return dir, fmt.Errorf("%s: %w", name, err)
		}
	}
	return dir, nil
}

// keepInZip: a name inside the zip that is unpacked: one that stays in the folder, and isn't hidden or macOS's
func keepInZip(name string) bool {
	if name == "" || !filepath.IsLocal(filepath.FromSlash(name)) {
		return false
	}
	for _, part := range strings.Split(name, "/") {
		if part == "__MACOSX" || strings.HasPrefix(part, ".") {
			return false
		}
	}
	return true
}

// unzipFile writes one file, no more than room bytes of it (its size in the zip can be a lie)
func unzipFile(f *zip.File, to string, room uint64) (uint64, error) {
	in, err := f.Open()
	if err != nil {
		return 0, err
	}
	defer in.Close()
	out, err := os.OpenFile(to, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
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
