package main

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/ftrain/mouseparty/apps"
)

func TestTLOOf(t *testing.T) {
	kept := map[string]bool{"./media/a.png": true}
	keep := func(src string) (apps.Picture, bool) {
		return apps.Picture{Ref: "asset:0123456789abcdef", W: 640, H: 360}, kept[src]
	}
	md := "---\ntitle: \"Vertigo, a \\\"reading\\\"\"\nauthor: A student\n---\n\n# The tower\n\n" +
		"Before ![The \"dolly\" zoom](./media/a.png) after.\n\nThe \"dolly\" zoom\n\n" +
		"![From the web](https://example.com/x.png)\n\n| Shot | ![x](./media/a.png) |\n|---|---|\n\n" +
		"------------------------------------------------------------------------\n\n## Part two\n"
	got := tloOf(md, "write", keep)
	want := "# Vertigo, a \"reading\" {.title}\n\n*A student*\n\n# The tower\n\nBefore after.\n\n" +
		"```image {alt=\"The 'dolly' zoom\" w=640 h=360}\nasset:0123456789abcdef\n```\n\n" +
		"From the web\n\n| Shot | x |\n|---|---|\n\n--- {.rule}\n\n## Part two\n"
	if got != want {
		t.Errorf("write:\n%s\nwant:\n%s", got, want)
	}
	deck := tloOf("## One\n\nWords\n\n------\n\n# Two\n\n- a\n", "deck", keep)
	if want := "## One\n\nWords\n\n---\n\n## Two\n\n- a\n"; deck != want {
		t.Errorf("deck:\n%s\nwant:\n%s", deck, want)
	}
}

// a document made by pandoc itself (so nothing but pandoc.wasm is needed), read back
func TestReadDocument(t *testing.T) {
	h := &Host{pics: newPictures(""), pandoc: newWasmTool("pandoc"), reading: make(chan struct{}, 1)}
	if !h.pandoc.ok() {
		t.Skip("no pandoc.wasm: scripts/fetch_pandoc.sh")
	}
	was := wasmCacheDir
	wasmCacheDir = func() string { abs, _ := filepath.Abs("build/wasm-cache"); return abs }
	defer func() { wasmCacheDir = was; h.pandoc.close() }()

	dir := t.TempDir()
	img := image.NewRGBA(image.Rect(0, 0, 320, 180))
	for i := range img.Pix {
		img.Pix[i] = uint8(i)
	}
	img.Set(0, 0, color.White)
	var pngBytes bytes.Buffer
	png.Encode(&pngBytes, img)
	os.WriteFile(filepath.Join(dir, "frame.png"), pngBytes.Bytes(), 0o600)
	os.WriteFile(filepath.Join(dir, "in.md"), []byte("---\ntitle: Vertigo\n---\n\n# The tower\n\nScottie *climbs*.\n\n"+
		"![The dolly zoom](frame.png)\n\n| Shot | Time |\n|---|---|\n| CU | 1:02 |\n\n---\n\n# The bell\n\nMadeleine.\n"), 0o600)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	made := map[string][]byte{}
	for _, f := range []string{"essay.docx", "talk.pptx"} {
		var stderr bytes.Buffer
		if err := h.pandoc.run(ctx, dir, nil, &stderr, "/in.md", "-o", "/"+f); err != nil {
			t.Fatalf("making %s: %v %s", f, err, stderr.String())
		}
		made[f], _ = os.ReadFile(filepath.Join(dir, f))
	}

	doc, err := h.readDocument(ctx, "essay.docx", made["essay.docx"], "write")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"# Vertigo {.title}", "# The tower", "Scottie *climbs*.", "Shot | Time", "--- {.rule}", "# The bell"} {
		if !strings.Contains(doc, want) {
			t.Errorf("the document has no %q:\n%s", want, doc)
		}
	}
	fence := regexp.MustCompile("```image \\{alt=\"The dolly zoom\" w=320 h=180\\}\nasset:([0-9a-f]{16})\n```").FindStringSubmatch(doc)
	if fence == nil {
		t.Fatalf("no picture fence:\n%s", doc)
	}
	if pic, ok := h.pics.get(fence[1]); !ok || !bytes.Equal(pic.b, pngBytes.Bytes()) && pic.mime != "image/png" {
		t.Errorf("the picture isn't kept as it was")
	}
	if strings.Contains(doc, "\nThe dolly zoom\n") || strings.Contains(doc, "](") {
		t.Errorf("a caption again, or a link left:\n%s", doc)
	}

	deck, err := h.readDocument(ctx, "talk.pptx", made["talk.pptx"], "deck")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(deck, "\n---\n") < 2 || !strings.Contains(deck, "## The tower") || !strings.Contains(deck, "asset:") {
		t.Errorf("not slides:\n%s", deck)
	}

	if _, err := h.readDocument(ctx, "x.exe", []byte("MZ"), "write"); err == nil {
		t.Error("an .exe was read")
	}
	if _, err := h.readDocument(ctx, "broken.docx", []byte("not a zip"), "write"); err == nil {
		t.Error("a broken .docx was read")
	}
}
