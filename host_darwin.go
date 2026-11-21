package main

import "os/exec"

// toolWrap (macOS): the tool with its box's arguments (sandbox.go, host.go's
// boxFor); the environment passes through, as to any program started by hand.
func (h *Host) toolWrap(name, bin string, args []string) (*exec.Cmd, error) {
	return h.boxFor(name, bin).command(nil, args...), nil
}
