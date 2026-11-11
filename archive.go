package main

// A link to an Internet Archive item's page (archive.org/details/<item>) isn't a
// download: the page is. Party > Add Download Link takes one anyway, and finds the
// item's videos in the Archive's own account of its files (its metadata API): one
// tape, or a row for each of a collection's.

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// where the Archive says what an item holds, and where it hands its files out (tests point these at their own)
var (
	archiveMetadata = "https://archive.org/metadata/"
	archiveDownload = "https://archive.org/download/"
)

// archiveItem: the item an Archive page link is for ("" for any other link), and the file of it, if the link names one
func archiveItem(u *url.URL) (item, file string) {
	host := strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
	parts := strings.Split(strings.Trim(u.EscapedPath(), "/"), "/")
	if host != "archive.org" || len(parts) < 2 || parts[0] != "details" || parts[1] == "" {
		return "", ""
	}
	item, _ = url.PathUnescape(parts[1])
	if len(parts) > 2 {
		file, _ = url.PathUnescape(strings.Join(parts[2:], "/"))
	}
	return item, file
}

type archiveFile struct {
	Name   string `json:"name"`
	Format string `json:"format"`
	Size   string `json:"size"`
}

const archiveMost = 100 // files taken from one item

// archiveLinks: the download links for an Archive item's videos (or, with none, its sound files), in the
// order of their names, or why there are none
func archiveLinks(item, file string) ([]*url.URL, string) {
	link := func(name string) *url.URL {
		u, _ := url.Parse(archiveDownload + url.PathEscape(item) + "/" + (&url.URL{Path: name}).EscapedPath())
		return u
	}
	if file != "" {
		if u := link(file); u != nil {
			return []*url.URL{u}, ""
		}
		return nil, "That Archive link couldn't be read"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", archiveMetadata+url.PathEscape(item), nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "The Internet Archive didn't answer"
	}
	defer resp.Body.Close()
	var meta struct {
		Files []archiveFile `json:"files"`
	}
	if resp.StatusCode != 200 || json.NewDecoder(resp.Body).Decode(&meta) != nil {
		return nil, "The Internet Archive didn't answer"
	}
	var links []*url.URL
	for _, name := range archivePick(meta.Files) {
		if u := link(name); u != nil {
			links = append(links, u)
		}
	}
	if len(links) == 0 {
		return nil, "There's no video at that Archive link"
	}
	return links, ""
}

// archivePick: of an item's files, the ones to play, in the order of their names. The Archive keeps each
// thing as its original and copies made from it, named alike: of each, the h.264 MP4 (what the Archive's
// own player plays, made to be played as it comes down), else the biggest video. An item with no video
// gives its sound files the same way.
func archivePick(files []archiveFile) []string {
	type pick struct {
		name string
		rank int64
	}
	const video = int64(1) << 41
	best := map[string]pick{}
	anyVideo := false
	for _, f := range files {
		e := ext(f.Name)
		size, _ := strconv.ParseInt(f.Size, 10, 64)
		rank := min(max(size, 0), video-1)
		switch {
		case e == ".mp4" && strings.HasPrefix(strings.ToLower(f.Format), "h.264"):
			rank += 2 * video
		case videoExts[e]:
			rank += video
		case audioExts[e]:
		default:
			continue
		}
		anyVideo = anyVideo || rank >= video
		stem := strings.ToLower(strings.TrimSuffix(f.Name, filepath.Ext(f.Name)))
		stem = strings.TrimSuffix(strings.TrimSuffix(stem, ".ia"), "_512kb") // how the Archive names its copies
		if b, ok := best[stem]; !ok || rank > b.rank {
			best[stem] = pick{f.Name, rank}
		}
	}
	var names []string
	for _, b := range best {
		if b.rank >= video || !anyVideo {
			names = append(names, b.name)
		}
	}
	sort.Strings(names)
	return names[:min(len(names), archiveMost)]
}
