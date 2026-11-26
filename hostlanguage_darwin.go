package main

import (
	"os"
	"os/exec"
	"regexp"
)

// hostLanguage: the Mac's first preferred language, two letters ("en"): System Settings, then $LANG
func hostLanguage() string {
	if out, err := exec.Command("defaults", "read", "-g", "AppleLanguages").Output(); err == nil {
		if m := regexp.MustCompile(`\(\s*"?([A-Za-z]{2,3})\b`).FindSubmatch(out); m != nil {
			return short(string(m[1]))
		}
	}
	if code := localeLanguage(os.Getenv("LANG")); code != "" {
		return code
	}
	return "en"
}
