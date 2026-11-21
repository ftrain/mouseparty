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
