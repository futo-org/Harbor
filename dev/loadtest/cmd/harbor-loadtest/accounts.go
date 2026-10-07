package main

import (
	"context"
	_ "embed"
	"errors"
	"flag"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"code.futo.org/harbor/harbor/dev/loadtest/internal/config"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/engine"
	pb "code.futo.org/harbor/harbor/dev/loadtest/internal/pb/polycentric/v2"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/polycentric"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/stats"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/world"
)

func loadAccounts(cfgPath string) (config.Config, *world.Accounts, error) {
	cfg, err := config.Load(cfgPath)
	if err != nil {
		return cfg, nil, err
	}
	accs := world.NewAccounts()
	if cfg.Run.AccountsFile == "" {
		return cfg, accs, errors.New("run.accountsFile is not set")
	}
	if _, err := accs.Load(cfg.Run.AccountsFile); err != nil {
		return cfg, nil, err
	}
	return cfg, accs, nil
}

// accounts lists the identities this tool created.
func accounts(args []string) error {
	fs := flag.NewFlagSet("accounts", flag.ExitOnError)
	cfgPath := fs.String("c", "", "config file (for run.accountsFile)")
	ids := fs.Bool("ids", false, "print identity hex strings only, one per line")
	kubectl := fs.Bool("kubectl", false, "print operator commands that delete every load-test identity server-side")
	fs.Parse(args)
	cfg, accs, err := loadAccounts(*cfgPath)
	if err != nil {
		return err
	}
	all := accs.All()
	switch {
	case *ids:
		for _, a := range all {
			fmt.Println(a.Identity())
		}
	case *kubectl:
		fmt.Println("# Deletes every load-test identity and the content derived from it, on both staging servers.")
		fmt.Println("# Review, then run with a kube context for the staging cluster. Restart the servers afterwards:")
		fmt.Println("# a running server caches identity heads in memory.")
		fmt.Println("for ns in harbor-server harbor-server-alt; do")
		fmt.Println("  for id in \\")
		for _, a := range all {
			fmt.Printf("    %s \\\n", a.Identity())
		}
		fmt.Println("  ; do")
		fmt.Println("    kubectl -n \"$ns\" exec deploy/\"$ns\" -c server -- /app/server delete-events --identity \"$id\" --yes")
		fmt.Println("  done")
		fmt.Println("  kubectl -n \"$ns\" rollout restart deploy/\"$ns\"")
		fmt.Println("done")
	default:
		var posts, live int
		var first, last time.Time
		for _, a := range all {
			posts += a.PostCount()
			live += len(a.LivePosts())
			if first.IsZero() || a.CreatedAt.Before(first) {
				first = a.CreatedAt
			}
			if a.CreatedAt.After(last) {
				last = a.CreatedAt
			}
		}
		_, published, _ := accs.Counts()
		fmt.Printf("accounts file:   %s\n", cfg.Run.AccountsFile)
		fmt.Printf("identities:      %d (%d published)\n", len(all), published)
		fmt.Printf("posts/reposts:   %d signed, %d not deleted\n", posts, live)
		if len(all) > 0 {
			fmt.Printf("created:         %s … %s\n", first.Format(time.DateTime), last.Format(time.DateTime))
		}
		fmt.Println("\nUse -ids for the identity list, -kubectl for server-side deletion commands,")
		fmt.Println("or `harbor-loadtest cleanup` to delete the posts through the protocol.")
	}
	return nil
}

// cleanup publishes signed Delete events for every live load-test post, so
// they disappear from feeds without operator access. Identities, profiles,
// reactions and follows remain (use `accounts -kubectl` to purge those).
func cleanup(args []string) error {
	fs := flag.NewFlagSet("cleanup", flag.ExitOnError)
	cfgPath := fs.String("c", "", "config file (targets and run.accountsFile)")
	yes := fs.Bool("yes", false, "actually send the deletes (default: dry run)")
	workers := fs.Int("workers", 8, "accounts processed in parallel")
	fs.Parse(args)
	cfg, accs, err := loadAccounts(*cfgPath)
	if err != nil {
		return err
	}
	var todo []*polycentric.Account
	total := 0
	for _, a := range accs.All() {
		if n := len(a.LivePosts()); n > 0 && a.IdentityPublished() {
			todo = append(todo, a)
			total += n
		}
	}
	fmt.Printf("%d posts across %d accounts to delete on %d server(s)\n", total, len(todo), len(cfg.Target.Servers))
	if !*yes {
		fmt.Println("dry run: re-run with -yes to send the Delete events")
		return nil
	}
	rec := stats.NewRecorder()
	env := engine.NewEnv(&cfg, rec, accs, world.NewPosts(1))
	var done, failed atomic.Int64
	work := make(chan *polycentric.Account)
	var wg sync.WaitGroup
	for i := 0; i < max(*workers, 1); i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for a := range work {
				var bundles []*pb.EventBundle
				for _, seq := range a.LivePosts() {
					bundles = append(bundles, a.Build(polycentric.CollFeed, &pb.Content{ContentBody: &pb.Content_Delete{
						Delete: &pb.Delete{EventKey: a.EventKey(polycentric.CollFeed, seq)},
					}}))
				}
				ok := true
				for start := 0; start < len(bundles); start += 50 {
					batch := bundles[start:min(start+50, len(bundles))]
					for _, s := range env.Servers {
						ctx, cancel := context.WithTimeout(context.Background(), cfg.Target.Timeout.D())
						_, err := s.PutEvents(ctx, batch, a)
						cancel()
						if err != nil {
							ok = false
							fmt.Fprintf(os.Stderr, "%s on %s: %v\n", world.ShortID(a.Identity()), s.Label, err)
						}
					}
				}
				if ok {
					done.Add(int64(len(bundles)))
				} else {
					failed.Add(int64(len(bundles)))
				}
			}
		}()
	}
	for _, a := range todo {
		work <- a
	}
	close(work)
	wg.Wait()
	if err := accs.Save(cfg.Run.AccountsFile); err != nil {
		return err
	}
	fmt.Printf("deleted %d posts (%d in batches with errors)\n", done.Load(), failed.Load())
	printTotals(rec.Totals())
	return nil
}

//go:embed example.yaml
var exampleConfig []byte

func initConfig(args []string) error {
	path := "harbor-loadtest.yaml"
	if len(args) > 0 {
		path = args[0]
	}
	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("%s already exists", path)
	}
	if err := os.WriteFile(path, exampleConfig, 0o644); err != nil {
		return err
	}
	fmt.Println("wrote", path)
	return nil
}
