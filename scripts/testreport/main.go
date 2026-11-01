// testreport reads `go test -json` (scripts/test.sh) and says what happened:
// each package as it finishes, the whole output of any test that failed, and
// every test that skipped, with why. A skipped test passes quietly in plain
// `go test`, so a missing tool (MediaMTX, the Datasette Python, Playwright)
// can hide a whole layer of tests: with NO_SKIPS=1 (as CI sets) any skip fails
// the run, except tests whose names match ALLOW_SKIPS, a regular expression.
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strings"
)

type event struct {
	Action  string
	Package string
	Test    string
	Output  string
	Elapsed float64
}

func main() {
	allow := regexp.MustCompile(`^$`)
	if a := os.Getenv("ALLOW_SKIPS"); a != "" {
		allow = regexp.MustCompile(a)
	}
	output := map[string][]string{} // package/test -> its lines
	var failed, skipped []string
	why := map[string]string{}
	in := bufio.NewScanner(os.Stdin)
	in.Buffer(make([]byte, 1<<20), 16<<20)
	broken := false
	for in.Scan() {
		var e event
		if json.Unmarshal(in.Bytes(), &e) != nil {
			fmt.Println(in.Text()) // not an event: a build error, say
			broken = true
			continue
		}
		key := e.Package + " " + e.Test
		switch e.Action {
		case "output":
			output[key] = append(output[key], e.Output)
		case "fail":
			if e.Test == "" { // the package: its own output is a build error, or a panic outside any test
				fmt.Printf("FAIL\t%s\t%.1fs\n%s", e.Package, e.Elapsed, strings.Join(output[key], ""))
			} else {
				failed = append(failed, key)
				fmt.Printf("--- FAIL: %s (%s)\n%s", e.Test, e.Package, strings.Join(output[key], ""))
			}
		case "skip":
			if e.Test != "" {
				skipped = append(skipped, key)
				why[key] = reason(output[key])
			}
		case "pass":
			if e.Test == "" {
				fmt.Printf("ok\t%s\t%.1fs\n", e.Package, e.Elapsed)
			}
		}
		if e.Action == "pass" || e.Action == "fail" || e.Action == "skip" {
			delete(output, key) // done with: only failures and skips are told
		}
	}
	sort.Strings(skipped)
	unexpected := 0
	if len(skipped) > 0 {
		fmt.Printf("\n%d skipped:\n", len(skipped))
		for _, k := range skipped {
			mark := ""
			if os.Getenv("NO_SKIPS") != "" && !allow.MatchString(strings.SplitN(k, " ", 2)[1]) {
				mark, unexpected = "  <- not allowed here", unexpected+1
			}
			fmt.Printf("  %s: %s%s\n", k, why[k], mark)
		}
	}
	switch {
	case broken || len(failed) > 0:
		fmt.Printf("\n%d failed\n", len(failed))
		os.Exit(1)
	case unexpected > 0:
		fmt.Printf("\n%d skipped where everything should run (NO_SKIPS; ALLOW_SKIPS=%q)\n", unexpected, os.Getenv("ALLOW_SKIPS"))
		os.Exit(1)
	}
}

// reason: what the test said as it skipped, its last line saying anything
var location = regexp.MustCompile(`^\s*\w+\.go:\d+: `)

func reason(lines []string) string {
	for i := len(lines) - 1; i >= 0; i-- {
		l := strings.TrimSpace(lines[i])
		if l == "" || strings.HasPrefix(l, "---") || strings.HasPrefix(l, "===") {
			continue
		}
		return location.ReplaceAllString(l, "")
	}
	return "(no reason given)"
}
