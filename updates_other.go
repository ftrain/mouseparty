//go:build !darwin

package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
)

const (
	updatesPage = "github.com/ftrain/mouseparty/releases"
	restartItem = "Settings > General's Restart to Update"
)

func fetchUpdateAsset(rel *release, step func(got, total int64)) (string, error) {
	dir, err := updateDir()
	if err != nil {
		return "", err
	}
	os.RemoveAll(dir)
	want := filepath.Join(dir, updateAsset)
	got, err := fetch(context.Background(), rel.URL, want, nil, func(_ string, got, total int64) { step(got, total) })
	if err == nil {
		err = updateSum(got, rel.Sum)
	}
	if err == nil && got != want {
		err = os.Rename(got, want)
	}
	if err != nil {
		os.RemoveAll(dir)
		return "", err
	}
	return want, nil
}

func updateSum(path, want string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	if hex.EncodeToString(h.Sum(nil)) != want {
		return errors.New("it isn't what the release says it is (its SHA-256 differs)")
	}
	return nil
}

func (a *App) tidyUpdateCache() bool {
	if a.update.state == "downloading" || a.update.state == "ready" {
		return false
	}
	if dir, err := updateDir(); err == nil {
		os.RemoveAll(dir)
	}
	return true
}
