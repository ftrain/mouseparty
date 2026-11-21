//go:build linux && !amd64 && !arm64

package main

import "errors"

func restrictSite() error { return errors.New("Linux viewer sandbox requires amd64 or arm64") }
