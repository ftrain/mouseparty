//go:build darwin

package main

// What Wails v2 leaves out of a Mac app, asked of AppKit directly: the standard About panel,
// Hide Others and Show All (the app menu is our own, so Settings… can be in it), the Dock
// icon's badge, the window's frame kept between launches, and whether the app is in front.
// Each runs on the main thread; with no app (tests), AppKit's nil makes each nothing.

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>
#include <stdlib.h>

static void mpAbout(const char *credits) {
	@autoreleasepool {
		NSString *text = [NSString stringWithUTF8String:credits];
		dispatch_async(dispatch_get_main_queue(), ^{
			NSFont *font = [NSFont systemFontOfSize:[NSFont smallSystemFontSize]];
			NSMutableParagraphStyle *centred = [[NSMutableParagraphStyle new] autorelease];
			centred.alignment = NSTextAlignmentCenter;
			NSAttributedString *c = [[[NSAttributedString alloc] initWithString:text
				attributes:@{NSFontAttributeName: font, NSForegroundColorAttributeName: [NSColor secondaryLabelColor],
				             NSParagraphStyleAttributeName: centred}] autorelease];
			[NSApp activateIgnoringOtherApps:YES];
			[NSApp orderFrontStandardAboutPanelWithOptions:@{NSAboutPanelOptionCredits: c}];
		});
	}
}

static void mpHideOthers(void) {
	dispatch_async(dispatch_get_main_queue(), ^{ [NSApp hideOtherApplications:nil]; });
}

// an Edit menu item's action, to whatever has the focus (a sheet's field)
static void mpSend(const char *action) {
	@autoreleasepool {
		SEL sel = NSSelectorFromString([NSString stringWithUTF8String:action]);
		dispatch_async(dispatch_get_main_queue(), ^{ [NSApp sendAction:sel to:nil from:nil]; });
	}
}

static void mpShowAll(void) {
	dispatch_async(dispatch_get_main_queue(), ^{ [NSApp unhideAllApplications:nil]; });
}

static void mpBadge(const char *label) {
	@autoreleasepool {
		NSString *s = label[0] ? [NSString stringWithUTF8String:label] : nil;
		dispatch_async(dispatch_get_main_queue(), ^{ [[NSApp dockTile] setBadgeLabel:s]; });
	}
}

// the window put where it was last time, and kept track of from now on (in the app's defaults)
static void mpKeepFrame(void) {
	dispatch_async(dispatch_get_main_queue(), ^{
		for (NSWindow *w in [NSApp windows]) {
			if (![w canBecomeMainWindow]) continue;
			[w setFrameUsingName:@"Mouse Party"];
			[w setFrameAutosaveName:@"Mouse Party"];
			break;
		}
	});
}

// NSRunningApplication may be asked from any thread (no waiting on the main one)
static int mpActive(void) {
	@autoreleasepool {
		return [[NSRunningApplication currentApplication] isActive];
	}
}
*/
import "C"

import "unsafe"

func nativeAbout(credits string) {
	c := C.CString(credits)
	defer C.free(unsafe.Pointer(c))
	C.mpAbout(c)
}

func nativeHideOthers() { C.mpHideOthers() }
func nativeShowAll()    { C.mpShowAll() }

// nativeSend: an action ("copy:") sent along the responder chain
func nativeSend(action string) {
	c := C.CString(action)
	defer C.free(unsafe.Pointer(c))
	C.mpSend(c)
}
func nativeKeepFrame() { C.mpKeepFrame() }

// nativeBadge: the Dock icon's badge ("" for none)
func nativeBadge(label string) {
	c := C.CString(label)
	defer C.free(unsafe.Pointer(c))
	C.mpBadge(c)
}

// nativeActive: Mouse Party is the app in front (true where that can't be told)
func nativeActive() bool { return C.mpActive() != 0 }
