package main

import (
	"os"

	"golang.org/x/sys/windows"
)

func hostLanguage() string {
	if tags, err := windows.GetUserPreferredUILanguages(windows.MUI_LANGUAGE_NAME); err == nil {
		if code := firstLanguage(tags); code != "" {
			return code
		}
	}
	if code := envLanguage(os.Getenv); code != "" {
		return code
	}
	return "en"
}
