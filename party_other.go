//go:build !darwin

package main

const eraseFailureShown = false

func afterErase(string) {
	then(relaunchTarget(), append(append(webviewData(), webviewFolders()...), erasable()...)...)
}
