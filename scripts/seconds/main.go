// seconds: a Go duration ("15m") as whole seconds, for scripts/fuzz.sh
package main

import (
	"fmt"
	"os"
	"time"
)

func main() {
	d, err := time.ParseDuration(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(int(d.Seconds()))
}
