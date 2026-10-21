package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"syscall"
	"time"

	"code.futo.org/harbor/harbor/dev/loadtest/internal/config"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/engine"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/harbor"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/vm"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/web"
)

func run(args []string) error {
	fs := flag.NewFlagSet("run", flag.ExitOnError)
	cfgPath := fs.String("c", "", "config file (YAML); defaults target Harbor staging")
	listen := fs.String("listen", "127.0.0.1:8089", "dashboard listen address")
	autostart := fs.Bool("start", false, "start a run immediately")
	headless := fs.Bool("headless", false, "no dashboard: start immediately, print progress, exit when the run ends")
	open := fs.Bool("open", false, "open the dashboard in a browser")
	duration := fs.Duration("duration", -1, "override run.duration (0 = until stopped)")
	fs.Parse(args)

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		return err
	}
	if *duration >= 0 {
		cfg.Run.Duration = config.Duration(*duration)
	}
	if err := cfg.Validate(); err != nil {
		return err
	}
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
	hub := web.NewHub()
	eng, err := engine.New(cfg, hub, log)
	if err != nil {
		return err
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	var poller *vm.Poller
	poke := make(chan struct{}, 1)
	if cfg.Metrics.Enabled && cfg.Metrics.URL != "" {
		poller = &vm.Poller{
			Client:   &vm.Client{BaseURL: cfg.Metrics.URL, HTTP: &http.Client{Timeout: 30 * time.Second}},
			Panels:   vm.DefaultPanels(),
			Scope:    cfg.Metrics.Scope,
			Interval: cfg.Metrics.Interval.D(),
			Step:     cfg.Metrics.Step.D(),
			Window: func(now time.Time) (time.Time, time.Time) {
				lookback := cfg.Metrics.Lookback.D()
				start, end, active := eng.RunWindow()
				switch {
				case active:
					return start.Add(-lookback), now
				case !start.IsZero() && now.Sub(end) < 10*time.Minute:
					// Keep showing the finished run (metrics lag ~1 minute).
					return start.Add(-lookback), now
				default:
					return now.Add(-lookback), now
				}
			},
			OnResult: func(s vm.Snapshot) {
				hub.Publish("metrics", s)
				// Save the platform view of the run alongside its results
				// (until 10 minutes after it ends, as metrics lag).
				start, end, active := eng.RunWindow()
				if dir := eng.ResultsDir(); dir != "" && !start.IsZero() && (active || time.Since(end) < 10*time.Minute) {
					writeMetrics(dir, s)
				}
			},
		}
		go poller.Run(ctx, poke)
	}

	if *headless {
		return runHeadless(ctx, eng)
	}

	srv := &web.Server{Engine: eng, Hub: hub, Poller: poller, Poke: poke}
	ln, err := net.Listen("tcp", *listen)
	if err != nil {
		return err
	}
	url := "http://" + ln.Addr().String()
	httpSrv := &http.Server{Handler: srv.Handler(), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if err := httpSrv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("dashboard server", "err", err)
		}
	}()
	fmt.Printf("Dashboard: %s\n", url)
	fmt.Printf("Targets:   %s (web %s)\n", strings.Join(cfg.Target.Servers, ", "), cfg.Target.WebURL)
	if poller != nil {
		fmt.Printf("Metrics:   %s (cluster %s)\n", cfg.Metrics.URL, cfg.Metrics.Scope.Cluster)
	}
	if *open {
		openBrowser(url)
	}
	if *autostart {
		if err := eng.Start(); err != nil {
			return err
		}
	}
	<-ctx.Done()
	fmt.Println("\nShutting down…")
	eng.Stop("interrupted")
	eng.Wait()
	shutdownCtx, c2 := context.WithTimeout(context.Background(), 3*time.Second)
	defer c2()
	_ = httpSrv.Shutdown(shutdownCtx)
	return nil
}

func runHeadless(ctx context.Context, eng *engine.Engine) error {
	if err := eng.Start(); err != nil {
		return err
	}
	done := make(chan struct{})
	go func() { eng.Wait(); close(done) }()
	t := time.NewTicker(10 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			eng.Stop("interrupted")
			<-done
		case <-done:
		case <-t.C:
			printProgress(eng)
			continue
		}
		break
	}
	sum, ok := eng.LastSummary()
	if ok {
		fmt.Printf("\nRun %s finished (%s), %s\n\n", sum.RunID, sum.Reason, sum.Ended.Sub(sum.Started).Round(time.Second))
		printTotals(sum.Totals)
		if dir := eng.ResultsDir(); dir != "" {
			fmt.Printf("\nResults written to %s\n", dir)
		}
	}
	return nil
}

func printProgress(eng *engine.Engine) {
	h := eng.History()
	if len(h) == 0 {
		return
	}
	window := h[max(0, len(h)-10):]
	secs := float64(len(window))
	var parts []string
	servers := map[string][2]int64{}
	for _, t := range window {
		for name, op := range t.Ops {
			if label, ok := strings.CutPrefix(name, harbor.AllPrefix); ok {
				v := servers[label]
				v[0] += op.Count
				v[1] += op.Errors
				servers[label] = v
			}
		}
	}
	labels := make([]string, 0, len(servers))
	for l := range servers {
		labels = append(labels, l)
	}
	sort.Strings(labels)
	for _, l := range labels {
		v := servers[l]
		errPct := 0.0
		if v[0] > 0 {
			errPct = 100 * float64(v[1]) / float64(v[0])
		}
		parts = append(parts, fmt.Sprintf("%s %.1f req/s %.1f%% err", l, float64(v[0])/secs, errPct))
	}
	last := window[len(window)-1]
	var inflight int64
	for _, s := range last.Scenarios {
		inflight += s.InFlight
	}
	fmt.Printf("[%5.0fs] %s | in flight %d | accounts %d\n", last.Elapsed, strings.Join(parts, " | "), inflight, last.Accounts[1])
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}

func writeMetrics(dir string, s vm.Snapshot) {
	raw, err := json.Marshal(s)
	if err != nil {
		return
	}
	tmp := filepath.Join(dir, "metrics.json.tmp")
	if os.WriteFile(tmp, raw, 0o644) == nil {
		_ = os.Rename(tmp, filepath.Join(dir, "metrics.json"))
	}
}
