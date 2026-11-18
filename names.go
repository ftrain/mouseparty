package main

import (
	"path"
	"strings"
	"unicode"
	"unicode/utf8"
)

func safeName(name string, windows bool) string {
	name = path.Base(strings.ReplaceAll(strings.ReplaceAll(name, `\`, "/"), "\x00", ""))
	if name == "/" || name == "." {
		name = ""
	}
	name = strings.Map(func(r rune) rune {
		switch {
		case unicode.IsControl(r):
			return -1
		case windows && strings.ContainsRune(`<>:"|?*`, r):
			return '_'
		}
		return r
	}, name)
	most := 200
	if windows {
		most = 120
	}
	name = strings.TrimLeft(strings.TrimSpace(keepTail(name, most)), ".")
	if windows {
		name = strings.TrimRight(name, ". ")
		if windowsReserved(name) {
			name = "_" + name
		}
	}
	if name == "" {
		name = "download"
	}
	return name
}

func keepTail(s string, most int) string {
	if len(s) <= most {
		return s
	}
	s = s[len(s)-most:]
	for len(s) > 0 && !utf8.RuneStart(s[0]) {
		s = s[1:]
	}
	return s
}

func windowsReserved(name string) bool {
	base, _, _ := strings.Cut(name, ".")
	base, _, _ = strings.Cut(base, ":")
	base = strings.ToUpper(strings.TrimRight(base, " "))
	switch base {
	case "CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$":
		return true
	}
	if len(base) < 4 || base[:3] != "COM" && base[:3] != "LPT" {
		return false
	}
	switch n := base[3:]; n {
	case "¹", "²", "³":
		return true
	default:
		return len(n) == 1 && n[0] >= '0' && n[0] <= '9'
	}
}
