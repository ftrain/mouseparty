//go:build !darwin

package main

// native_darwin.go's AppKit calls; elsewhere (Linux CI runs the tests) each is nothing

func nativeAbout(string) {}
func nativeHideOthers()  {}
func nativeShowAll()     {}
func nativeKeepFrame()   {}
func nativeBadge(string) {}
func nativeActive() bool { return true }
