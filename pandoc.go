package main

// Documents brought into the viewer page: a Word file, an OpenOffice one, a
// PowerPoint, an EPUB, a web page, LaTeX and the rest of what pandoc reads,
// turned into a Tiny Little Office document (Markdown, docs/tlo.md in that
// library) for everyone to edit at once (apps/office.go). Pandoc runs as
// WebAssembly (wasm.go), seeing a folder of its own with the file in it, one
// document at a time. Its Markdown is what the library reads already, but for
// three things: a picture is the host's (the picture store's image fence, never
// a link: no document fetches anything), a Word rule is a rule and not a page
// break, and for Slides a heading starts a slide.

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/ftrain/mouseparty/apps"
)

const (
	readMaxBytes = 32 << 20 // a document brought in
	readTime     = 90 * time.Second
)

// what pandoc reads, by the file's extension
var readFormats = map[string]string{
	".docx": "docx", ".odt": "odt", ".rtf": "rtf", ".epub": "epub", ".fb2": "fb2",
	".html": "html", ".htm": "html", ".xhtml": "html",
	".tex": "latex", ".latex": "latex", ".typ": "typst",
	".md": "markdown", ".markdown": "markdown", ".txt": "markdown", ".rst": "rst", ".org": "org",
	".textile": "textile", ".wiki": "mediawiki", ".adoc": "asciidoc", ".dbk": "docbook", ".opml": "opml",
	".ipynb": "ipynb", ".pptx": "pptx", ".xlsx": "xlsx", ".csv": "csv", ".tsv": "tsv",
}

var (
	mdImage  = regexp.MustCompile(`!\[([^\]]*)\]\(<?([^)\s>]*)>?(?:\s+"[^"]*")?\)`)
	mdRule   = regexp.MustCompile(`^-{4,}\s*$`) // pandoc's own; a head's lines are three
	mdSlide  = regexp.MustCompile(`^#{1,2} `)
	mdInList = regexp.MustCompile(`^\s*([|>]|[-*+] |\d+[.)] )`)
	mdSpaces = regexp.MustCompile(` {2,}`)
)

// postRead: a viewer's document, as a document of the app it was brought into
// (name says what it is: ?name=essay.docx&app=write)
func (h *Host) postRead(w http.ResponseWriter, r *http.Request) {
	name, app := r.URL.Query().Get("name"), r.URL.Query().Get("app")
	b, err := readAll(r)
	if err != nil {
		http.Error(w, "too big", http.StatusRequestEntityTooLarge)
		return
	}
	select {
	case h.reading <- struct{}{}:
		defer func() { <-h.reading }()
	default:
		http.Error(w, "another document is being read", http.StatusTooManyRequests)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), readTime)
	defer cancel()
	text, err := h.readDocument(ctx, name, b, app)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	writeJSON(w, map[string]string{"text": text})
}

// readDocument: the file's words, pictures and tables as a document of app
// ("write" or "deck"), its pictures put in the picture store
func (h *Host) readDocument(ctx context.Context, name string, b []byte, app string) (string, error) {
	e := ext(name)
	format := readFormats[e]
	if format == "" {
		return "", fmt.Errorf("can't read %s files", e)
	}
	if !h.pandoc.ok() {
		return "", errors.New("documents can't be read in this build")
	}
	dir, err := os.MkdirTemp("", "mouseparty-read-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(dir)
	if err := os.WriteFile(filepath.Join(dir, "in"+e), b, 0o600); err != nil {
		return "", err
	}
	var stderr bytes.Buffer
	err = h.pandoc.run(ctx, dir, nil, &stderr, "/in"+e, "-f", format, "-t", "gfm-raw_html", "-s",
		"--wrap=none", "--extract-media=/media", "-o", "/out.md")
	if err != nil {
		if s := strings.TrimSpace(stderr.String()); s != "" {
			err = errors.New(firstLine(s))
		}
		return "", fmt.Errorf("couldn't read %s: %w", filepath.Base(name), err)
	}
	md, err := os.ReadFile(filepath.Join(dir, "out.md"))
	if err != nil {
		return "", err
	}
	return tloOf(string(md), app, func(src string) (apps.Picture, bool) {
		// a picture pandoc took out of the file, never anywhere else
		p := filepath.Join(dir, filepath.Clean("/"+strings.TrimPrefix(src, "./")))
		b, err := os.ReadFile(p)
		if err != nil {
			return apps.Picture{}, false
		}
		pic, err := h.pics.put(b, http.DetectContentType(b))
		return pic, err == nil
	}), nil
}

// tloOf: pandoc's Markdown (GitHub's, one line a paragraph) as Tiny Little
// Office reads it, each picture kept by keep (or, where it can't be, its words)
func tloOf(md, app string, keep func(src string) (apps.Picture, bool)) string {
	md = strings.ReplaceAll(md, "\r\n", "\n")
	var out strings.Builder
	// the head: a title (and author) as the document's own first words
	if rest, ok := strings.CutPrefix(md, "---\n"); ok {
		if head, body, ok := strings.Cut(rest, "\n---\n"); ok {
			md = body
			title, by := headValue(head, "title"), headValue(head, "author")
			switch {
			case title != "" && app == "deck":
				fmt.Fprintf(&out, "## %s {.title}\n\n", apps.EscapeLine(title))
				if by != "" {
					fmt.Fprintf(&out, "%s\n\n", apps.EscapeLine(by))
				}
			case title != "":
				fmt.Fprintf(&out, "# %s {.title}\n\n", apps.EscapeLine(title))
				if by != "" {
					fmt.Fprintf(&out, "*%s*\n\n", apps.EscapeLine(by))
				}
			}
		}
	}
	slides := out.Len() > 0
	lines := strings.Split(md, "\n")
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		switch {
		case mdRule.MatchString(line):
			if app == "deck" {
				continue // its slides start at its headings
			}
			out.WriteString("--- {.rule}\n")
			continue
		case app == "deck" && mdSlide.MatchString(line):
			if slides {
				out.WriteString("---\n\n")
			}
			slides = true
			out.WriteString("##" + strings.TrimLeft(line, "#") + "\n")
			continue
		}
		if !mdImage.MatchString(line) {
			out.WriteString(line + "\n")
			continue
		}
		// a picture in a table or a list stays as its words there; anywhere else it's a block of its own,
		// after the paragraph it was in, and a caption that only says its words again goes
		inside := mdInList.MatchString(line)
		var fences []string
		alts := map[string]bool{}
		words := mdImage.ReplaceAllStringFunc(line, func(m string) string {
			sub := mdImage.FindStringSubmatch(m)
			alt := sub[1]
			if !inside {
				if pic, ok := keep(sub[2]); ok {
					fences = append(fences, apps.ImageFence(pic, alt))
					alts[strings.TrimSpace(alt)] = true
					return ""
				}
			}
			return alt
		})
		if !inside {
			words = strings.TrimSpace(mdSpaces.ReplaceAllString(words, " "))
		}
		if strings.TrimSpace(words) != "" {
			out.WriteString(words + "\n")
		}
		for n, f := range fences {
			if n > 0 || strings.TrimSpace(words) != "" {
				out.WriteString("\n")
			}
			out.WriteString(f)
		}
		if len(fences) > 0 && i+2 < len(lines) && lines[i+1] == "" && alts[strings.TrimSpace(lines[i+2])] {
			i += 2
			out.WriteString("\n")
		}
	}
	return strings.TrimSpace(oneBlank(out.String())) + "\n"
}

// oneBlank: no more than one empty line between blocks (but as written inside a code block)
func oneBlank(s string) string {
	var b strings.Builder
	code, blank := false, false
	for _, l := range strings.Split(s, "\n") {
		if strings.HasPrefix(l, "```") || strings.HasPrefix(l, "~~~") {
			code = !code
		}
		if l == "" && blank && !code {
			continue
		}
		blank = l == ""
		b.WriteString(l + "\n")
	}
	return b.String()
}

// headValue: a one-line value of pandoc's YAML head, its quotes taken off
func headValue(head, key string) string {
	for _, l := range strings.Split(head, "\n") {
		if v, ok := strings.CutPrefix(l, key+":"); ok {
			v = strings.TrimSpace(v)
			if len(v) >= 2 && (v[0] == '"' && v[len(v)-1] == '"' || v[0] == '\'' && v[len(v)-1] == '\'') {
				v = strings.ReplaceAll(v[1:len(v)-1], `\"`, `"`)
			}
			return v
		}
	}
	return ""
}

func firstLine(s string) string {
	l, _, _ := strings.Cut(s, "\n")
	return l
}
