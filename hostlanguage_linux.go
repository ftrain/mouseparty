package main

import "os"

func hostLanguage() string {
	if code := envLanguage(os.Getenv); code != "" {
		return code
	}
	return "en"
}
