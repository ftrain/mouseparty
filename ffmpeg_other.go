//go:build !linux

package main

import (
	"context"
	"os/exec"
)

func offlineFFmpegCommand(ctx context.Context, bin, path string, args func(string) []string) (*exec.Cmd, error) {
	argv := args(path)
	return ffmpegBox(bin, nil, argv).command(ctx, argv...), nil
}

// publishFFmpegCommand: the macOS box (sandbox.go's ffmpegBox), whose rules come
// from the arguments themselves.
func publishFFmpegCommand(ctx context.Context, bin string, own []string, args []string) (*exec.Cmd, error) {
	return ffmpegBox(bin, own, args).command(ctx, args...), nil
}
