package main

import (
	"errors"
	"os"
	"strconv"
	"testing"

	"golang.org/x/sys/windows/registry"
)

func TestWindowsErasingAKeyLeavesSoftwareAlone(t *testing.T) {
	tempHome(t)
	name := `Software\MouseParty-test-` + strconv.Itoa(os.Getpid())
	beside := name + "-beside"
	for _, k := range []string{name, beside} {
		t.Cleanup(func() { eraseKeyTree(registry.CURRENT_USER, k) })
	}
	for _, k := range []string{name + `\inner\deeper`, name + `\other`, beside} {
		key, _, err := registry.CreateKey(registry.CURRENT_USER, k, registry.SET_VALUE)
		if err != nil {
			t.Fatal(err)
		}
		err = key.SetStringValue("kept", "x")
		key.Close()
		if err != nil {
			t.Fatal(err)
		}
	}
	if err := eraseOne(registryRoot + name); err != nil {
		t.Fatal(err)
	}
	if k, err := registry.OpenKey(registry.CURRENT_USER, name, registry.QUERY_VALUE); err == nil {
		k.Close()
		t.Fatalf(`HKCU\%s is still there`, name)
	} else if !errors.Is(err, registry.ErrNotExist) {
		t.Fatal(err)
	}
	for _, k := range []string{`Software`, `Software\Microsoft`, beside} {
		key, err := registry.OpenKey(registry.CURRENT_USER, k, registry.QUERY_VALUE)
		if err != nil {
			t.Fatalf(`HKCU\%s went with it: %v`, k, err)
		}
		key.Close()
	}
	if err := eraseOne(registryRoot + name); err != nil {
		t.Fatal("erasing it again:", err)
	}
	for _, k := range []string{``, `Software`, `Software\`, `\Software`, `Software\Microsoft`, `Software\Classes`} {
		if ownKey(k) {
			t.Errorf(`HKCU\%s would be erased`, k)
		}
	}
}
