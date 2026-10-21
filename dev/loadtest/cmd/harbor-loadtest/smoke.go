package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"
	"text/tabwriter"
	"time"

	"code.futo.org/harbor/harbor/dev/loadtest/internal/config"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/engine"
	pb "code.futo.org/harbor/harbor/dev/loadtest/internal/pb/polycentric/v2"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/polycentric"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/stats"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/world"
)

// smoke runs every scenario once, then checks that what was written is
// visible from every server. It exits non-zero on any failure.
func smoke(args []string) error {
	fs := flag.NewFlagSet("smoke", flag.ExitOnError)
	cfgPath := fs.String("c", "", "config file (YAML); defaults target Harbor staging")
	only := fs.String("only", "", "comma-separated scenarios to run (default: all)")
	fs.Parse(args)

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		return err
	}
	// Keep smoke sessions short.
	for name, sc := range cfg.Scenarios {
		if sc.Params == nil {
			sc.Params = map[string]any{}
		}
		sc.Params["thinkTime"] = map[string]any{"min": "100ms", "max": "300ms"}
		sc.Params["scrollSteps"] = map[string]any{"min": 1, "max": 1}
		sc.Params["threadProb"] = 1.0
		sc.Params["profileProb"] = 1.0
		sc.Params["notificationProb"] = 1.0
		cfg.Scenarios[name] = sc
	}
	rec := stats.NewRecorder()
	accounts := world.NewAccounts()
	if cfg.Run.AccountsFile != "" {
		if _, err := accounts.Load(cfg.Run.AccountsFile); err != nil {
			return err
		}
	}
	posts := world.NewPosts(1000)
	for _, a := range accounts.All() {
		for _, seq := range a.LivePosts() {
			posts.Add(world.PostRef{Key: a.EventKey(polycentric.CollFeed, seq), Author: a.Identity(), Ours: true})
		}
	}
	env := engine.NewEnv(&cfg, rec, accounts, posts)
	defer func() {
		if cfg.Run.AccountsFile != "" {
			if err := accounts.Save(cfg.Run.AccountsFile); err != nil {
				fmt.Fprintln(os.Stderr, "saving accounts:", err)
			}
		}
	}()

	order := []string{"register", "register", "browse", "browse_user", "post", "post", "reply", "react", "repost", "follow", "search"}
	want := map[string]bool{}
	for _, n := range strings.Split(*only, ",") {
		if n = strings.TrimSpace(n); n != "" {
			want[n] = true
		}
	}
	failed := 0
	began := time.Now()
	ctx := context.Background()
	for _, name := range order {
		if len(want) > 0 && !want[name] {
			continue
		}
		var spec func(ctx context.Context) error
		for _, s := range engine.Scenarios {
			if s.Name == name {
				spec = s.New(env, config.Params(cfg.Scenarios[name].Params))
			}
		}
		start := time.Now()
		cctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
		err := spec(cctx)
		cancel()
		status := "ok"
		if err != nil {
			status = "FAIL: " + err.Error()
			failed++
		}
		fmt.Printf("%-12s %-8s %s\n", name, time.Since(start).Round(time.Millisecond), status)
	}

	// Visibility checks: every account this smoke run created must resolve on
	// every server with its profile, and its latest post must be in its feed.
	checked := 0
	for _, a := range accounts.All() {
		if !a.IdentityPublished() || a.CreatedAt.Before(began) {
			continue
		}
		checked++
		for _, s := range env.Servers {
			var prof pb.GetProfileResponse
			if err := s.Call(ctx, "ProfileService", "GetProfile", &pb.GetProfileRequest{Identity: a.Identity()}, &prof, nil); err != nil {
				fmt.Printf("verify       %s GetProfile(%s): %v\n", s.Label, world.ShortID(a.Identity()), err)
				failed++
				continue
			}
			if len(prof.EventBundles) == 0 {
				fmt.Printf("verify       %s GetProfile(%s): no profile events returned\n", s.Label, world.ShortID(a.Identity()))
				failed++
			}
			live := a.LivePosts()
			if len(live) == 0 {
				continue
			}
			var feed pb.GetFeedResponse
			if err := s.Call(ctx, "FeedsService", "GetIdentityFeed", &pb.GetIdentityFeedRequest{Identity: a.Identity(), PageParams: &pb.PageParams{}}, &feed, nil); err != nil {
				fmt.Printf("verify       %s GetIdentityFeed(%s): %v\n", s.Label, world.ShortID(a.Identity()), err)
				failed++
				continue
			}
			found := false
			for _, b := range feed.EventBundles {
				if k, err := polycentric.KeyOf(b); err == nil && k.Sequence == live[len(live)-1] {
					found = true
				}
			}
			if !found {
				fmt.Printf("verify       %s: latest post seq %d of %s not in its identity feed (%d items)\n", s.Label, live[len(live)-1], world.ShortID(a.Identity()), len(feed.EventBundles))
				failed++
			}
		}
	}
	fmt.Printf("verify       checked %d fresh account(s) on %d server(s)\n\n", checked, len(env.Servers))
	printTotals(rec.Totals())
	if samples := rec.ErrorSamples(); len(samples) > 0 {
		fmt.Println("\nerrors:")
		keys := make([]string, 0, len(samples))
		for k := range samples {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			fmt.Printf("  %s: %s\n", k, samples[k])
		}
	}
	if failed > 0 {
		return fmt.Errorf("%d check(s) failed", failed)
	}
	fmt.Println("\nsmoke test passed")
	return nil
}

func printTotals(t map[string]stats.OpSnapshot) {
	names := make([]string, 0, len(t))
	for k := range t {
		names = append(names, k)
	}
	sort.Strings(names)
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', tabwriter.AlignRight)
	fmt.Fprintln(w, "operation\tcount\terrors\tp50 ms\tp95 ms\tmax ms\t")
	for _, n := range names {
		s := t[n]
		fmt.Fprintf(w, "%s\t%d\t%d\t%.0f\t%.0f\t%.0f\t\n", n, s.Count, s.Errors, s.P50Ms, s.P95Ms, s.MaxMs)
	}
	w.Flush()
}
