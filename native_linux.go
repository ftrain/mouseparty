package main

// The Linux host can run the viewer and --selftest without AppKit. Leave
// desktop integration to the window manager until there is a Linux package.
func nativeHideOthers()  {}
func nativeShowAll()     {}
func nativeSend(string)  {}
func nativeKeepFrame()   {}
func nativeBadge(string) {}
func nativeActive() bool { return true }
