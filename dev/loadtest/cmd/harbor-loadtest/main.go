// Command harbor-loadtest drives realistic load against a Harbor deployment
// and shows client- and server-side results live.
package main

import (
	"fmt"
	"os"
)

const usage = `harbor-loadtest — load testing for Harbor (Polycentric)

Usage:
  harbor-loadtest [run] [flags]    start the dashboard (and optionally a run)
  harbor-loadtest smoke [flags]    run every scenario once and verify the results
  harbor-loadtest accounts [flags] list load-test identities (for cleanup)
  harbor-loadtest cleanup [flags]  delete load-test posts via signed Delete events
  harbor-loadtest init [file]      write an example config

Run "harbor-loadtest <command> -h" for flags.
`

func main() {
	args := os.Args[1:]
	cmd := "run"
	if len(args) > 0 && len(args[0]) > 0 && args[0][0] != '-' {
		cmd, args = args[0], args[1:]
	}
	var err error
	switch cmd {
	case "run":
		err = run(args)
	case "smoke":
		err = smoke(args)
	case "accounts":
		err = accounts(args)
	case "cleanup":
		err = cleanup(args)
	case "init":
		err = initConfig(args)
	case "help", "-h", "--help":
		fmt.Print(usage)
	default:
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
