// Package engine owns test runs: it builds the scenario environment,
// drives one executor per scenario, samples stats every second, enforces the
// safety rules, and writes results.
package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"code.futo.org/harbor/harbor/dev/loadtest/internal/config"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/grpcweb"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/harbor"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/polycentric"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/scenario"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/stats"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/world"
	"gopkg.in/yaml.v3"
)

// Scenarios in display order, with their constructors.
var Scenarios = []struct {
	Name  string
	Title string
	Unit  string
	New   func(*scenario.Env, config.Params) func(context.Context) error
}{
	{"browse", "Visitors browsing (logged out)", "sessions/s", scenario.Browse},
	{"browse_user", "Users browsing (logged in)", "sessions/s", scenario.BrowseUser},
	{"register", "Registrations", "signups/s", scenario.Register},
	{"post", "Posts", "posts/s", scenario.Post},
	{"reply", "Replies", "replies/s", scenario.Reply},
	{"react", "Reactions", "reactions/s", scenario.React},
	{"repost", "Reposts", "reposts/s", scenario.Repost},
	{"follow", "Follows", "follows/s", scenario.Follow},
	{"search", "Searches", "searches/s", scenario.Search},
}

// Tick is one second of measurements.
type Tick struct {
	T         int64                       `json:"t"` // unix ms
	Elapsed   float64                     `json:"elapsed"`
	Ops       map[string]stats.OpSnapshot `json:"ops"`
	Scenarios []ExecutorStats             `json:"scenarios"`
	Accounts  [3]int                      `json:"accounts"` // total, published, leased
	Posts     int                         `json:"posts"`
	Routines  int                         `json:"goroutines"`
}

// Status describes the engine for the dashboard.
type Status struct {
	State     string        `json:"state"` // idle, running, stopping, finished
	RunID     string        `json:"runId,omitempty"`
	StartedAt time.Time     `json:"startedAt,omitzero"`
	EndedAt   time.Time     `json:"endedAt,omitzero"`
	Duration  float64       `json:"duration"` // planned seconds, 0 = until stopped
	Message   string        `json:"message,omitempty"`
	Paused    bool          `json:"paused"`
	Config    config.Config `json:"config"`
}

// Publisher receives live events (the dashboard hub).
type Publisher interface {
	Publish(event string, v any)
}

type Engine struct {
	pub Publisher
	log *slog.Logger

	mu       sync.Mutex
	cfg      config.Config
	accounts *world.Accounts
	posts    *world.Posts
	run      *Run
	last     *Run
	notes    []Note
}

// Note is a notable event shown in the dashboard's log.
type Note struct {
	T     time.Time `json:"t"`
	Level string    `json:"level"`
	Text  string    `json:"text"`
}

func New(cfg config.Config, pub Publisher, log *slog.Logger) (*Engine, error) {
	e := &Engine{pub: pub, log: log, cfg: cfg, accounts: world.NewAccounts(), posts: world.NewPosts(50_000)}
	if cfg.Run.AccountsFile != "" {
		n, err := e.accounts.Load(cfg.Run.AccountsFile)
		if err != nil {
			return nil, fmt.Errorf("loading %s: %w", cfg.Run.AccountsFile, err)
		}
		if n > 0 {
			e.note("info", fmt.Sprintf("Loaded %d accounts from %s", n, cfg.Run.AccountsFile))
			for _, a := range e.accounts.All() {
				for _, seq := range a.LivePosts() {
					e.posts.Add(world.PostRef{Key: a.EventKey(polycentric.CollFeed, seq), Author: a.Identity(), Ours: true})
				}
			}
		}
	}
	return e, nil
}

func (e *Engine) note(level, text string) {
	n := Note{T: time.Now(), Level: level, Text: text}
	e.notes = append(e.notes, n)
	if len(e.notes) > 200 {
		e.notes = e.notes[len(e.notes)-200:]
	}
	if e.log != nil {
		e.log.Info(text, "level", level)
	}
	if e.pub != nil {
		e.pub.Publish("note", n)
	}
}

// Note records a message for the dashboard log.
func (e *Engine) Note(level, text string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.note(level, text)
}

func (e *Engine) Notes() []Note {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]Note(nil), e.notes...)
}

// Config returns the configuration the next run will use.
func (e *Engine) Config() config.Config {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.cfg
}

// SetConfig replaces the configuration for the next run.
func (e *Engine) SetConfig(cfg config.Config) error {
	if err := cfg.Validate(); err != nil {
		return err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.run != nil {
		return fmt.Errorf("a run is in progress")
	}
	e.cfg = cfg
	return nil
}

func (e *Engine) Accounts() *world.Accounts { return e.accounts }

func (e *Engine) Status() Status {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.statusLocked()
}

func (e *Engine) statusLocked() Status {
	st := Status{State: "idle", Config: e.cfg}
	r := e.run
	if r == nil {
		r = e.last
	}
	if r != nil {
		st.RunID, st.StartedAt, st.EndedAt = r.ID, r.Started, r.Ended
		st.Duration = r.plannedDuration().Seconds()
		st.Message = r.message
		st.Paused = r.paused
		switch {
		case e.run == nil:
			st.State = "finished"
		case r.stopping:
			st.State = "stopping"
		default:
			st.State = "running"
		}
	}
	return st
}

// History returns the current (or last) run's ticks.
func (e *Engine) History() []Tick {
	e.mu.Lock()
	r := e.run
	if r == nil {
		r = e.last
	}
	e.mu.Unlock()
	if r == nil {
		return nil
	}
	return r.history()
}

// RunWindow returns the time range of the current or last run (zero when
// there has been none).
func (e *Engine) RunWindow() (start, end time.Time, active bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.run != nil {
		return e.run.Started, time.Time{}, true
	}
	if e.last != nil {
		return e.last.Started, e.last.Ended, false
	}
	return time.Time{}, time.Time{}, false
}

// ResultsDir of the current or last run.
func (e *Engine) ResultsDir() string {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.run != nil {
		return e.run.dir
	}
	if e.last != nil {
		return e.last.dir
	}
	return ""
}

// Start begins a run with the engine's configuration.
func (e *Engine) Start() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.run != nil {
		return fmt.Errorf("a run is already in progress")
	}
	cfg := e.cfg
	if err := cfg.Validate(); err != nil {
		return err
	}
	r, err := newRun(e, cfg)
	if err != nil {
		return err
	}
	e.run = r
	e.cfg = r.cfg.Clone()
	e.note("info", fmt.Sprintf("Run %s started against %s", r.ID, strings.Join(cfg.Target.Servers, ", ")))
	go r.loop()
	e.publishStatusLocked()
	return nil
}

// Stop ends the current run gracefully.
func (e *Engine) Stop(reason string) {
	e.mu.Lock()
	r := e.run
	e.mu.Unlock()
	if r != nil {
		r.stop(reason)
	}
}

// Wait blocks until the current run (if any) has finished.
func (e *Engine) Wait() {
	e.mu.Lock()
	r := e.run
	e.mu.Unlock()
	if r != nil {
		<-r.done
	}
}

func (e *Engine) publishStatusLocked() {
	if e.pub != nil {
		e.pub.Publish("status", e.statusLocked())
	}
}

// ScenarioUpdate is a live change to one scenario.
type ScenarioUpdate struct {
	Enabled     *bool    `json:"enabled,omitempty"`
	Rate        *float64 `json:"rate,omitempty"`
	ClearRate   bool     `json:"clearRate,omitempty"`
	MaxInFlight *int     `json:"maxInFlight,omitempty"`
}

// UpdateScenario adjusts a scenario: live if a run is active, otherwise in
// the configuration for the next run.
func (e *Engine) UpdateScenario(name string, u ScenarioUpdate) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	sc, ok := e.cfg.Scenarios[name]
	if !ok {
		return fmt.Errorf("unknown scenario %q", name)
	}
	if u.Enabled != nil {
		sc.Enabled = *u.Enabled
	}
	if u.Rate != nil {
		sc.Rate = *u.Rate
		if e.run == nil {
			sc.Stages = nil // an explicit rate replaces the ramp for the next run
		}
	}
	if u.MaxInFlight != nil {
		sc.MaxInFlight = *u.MaxInFlight
	}
	e.cfg.Scenarios[name] = sc
	if e.run != nil {
		ex := e.run.executors[name]
		if ex == nil {
			return nil
		}
		if u.Enabled != nil {
			ex.SetEnabled(*u.Enabled)
		}
		if u.Rate != nil {
			ex.SetRate(*u.Rate)
		}
		if u.ClearRate {
			ex.ClearRate()
		}
		if u.MaxInFlight != nil {
			ex.SetMaxInFlight(*u.MaxInFlight)
		}
		e.note("info", fmt.Sprintf("%s: %s", name, describeUpdate(u)))
	}
	return nil
}

func describeUpdate(u ScenarioUpdate) string {
	var parts []string
	if u.Enabled != nil {
		if *u.Enabled {
			parts = append(parts, "enabled")
		} else {
			parts = append(parts, "disabled")
		}
	}
	if u.Rate != nil {
		parts = append(parts, fmt.Sprintf("rate set to %g/s", *u.Rate))
	}
	if u.ClearRate {
		parts = append(parts, "rate back to configured stages")
	}
	if u.MaxInFlight != nil {
		parts = append(parts, fmt.Sprintf("max in flight %d", *u.MaxInFlight))
	}
	return strings.Join(parts, ", ")
}

// SetPaused holds or releases every scenario of the active run.
func (e *Engine) SetPaused(p bool, why string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.run == nil || e.run.paused == p {
		return
	}
	e.run.paused = p
	for _, ex := range e.run.executors {
		ex.Hold(p)
	}
	if p {
		e.run.message = why
		e.note("warn", "Paused all scenarios: "+why)
	} else {
		e.run.message = ""
		e.note("info", "Resumed all scenarios")
	}
	e.publishStatusLocked()
}

// Run is one execution of the configured scenarios.
type Run struct {
	e         *Engine
	ID        string
	cfg       config.Config
	env       *scenario.Env
	rec       *stats.Recorder
	executors map[string]*Executor
	order     []string
	Started   time.Time
	Ended     time.Time
	dir       string

	schedCtx    context.Context
	schedCancel context.CancelFunc
	iterCtx     context.Context
	iterCancel  context.CancelFunc
	stopOnce    sync.Once
	stopReason  string
	done        chan struct{}

	stopping bool
	paused   bool
	message  string

	hmu   sync.Mutex
	ticks []Tick
	tickF *os.File

	dirtyMu sync.Mutex
	dirty   bool
}

func newTransport(timeout time.Duration) *http.Transport {
	tr := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          4096,
		MaxIdleConnsPerHost:   1024,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: timeout,
	}
	tr.HTTP2 = &http.HTTP2Config{SendPingTimeout: 30 * time.Second, PingTimeout: 15 * time.Second}
	return tr
}

// NewClients builds one pooled gRPC-Web client per URL.
func NewClients(cfg config.Config, urls ...string) []*grpcweb.Client {
	pools := max(cfg.Target.ConnectionPools, 1)
	hdr := http.Header{}
	if cfg.Target.WebURL != "" {
		hdr.Set("Origin", strings.TrimRight(cfg.Target.WebURL, "/"))
		hdr.Set("Referer", strings.TrimRight(cfg.Target.WebURL, "/")+"/")
	}
	out := make([]*grpcweb.Client, 0, len(urls))
	for _, u := range urls {
		c := &grpcweb.Client{BaseURL: strings.TrimRight(u, "/"), UserAgent: cfg.Target.UserAgent, Headers: hdr}
		for i := 0; i < pools; i++ {
			c.Pool = append(c.Pool, &http.Client{Transport: newTransport(cfg.Target.Timeout.D()), Timeout: cfg.Target.Timeout.D()})
		}
		out = append(out, c)
	}
	return out
}

// NewEnv builds the scenario environment for cfg.
func NewEnv(cfg *config.Config, rec *stats.Recorder, accounts *world.Accounts, posts *world.Posts) *scenario.Env {
	env := &scenario.Env{
		Cfg:      cfg,
		Rec:      rec,
		Accounts: accounts,
		Posts:    posts,
		Corpus: world.NewCorpus(cfg.Content.CorpusSize, cfg.Content.UniquePosts, cfg.Content.LoadtestLabel,
			cfg.Content.NamePrefix, cfg.Content.ImageVariants, cfg.Content.ImageCorpus),
	}
	labels := harbor.Labels(cfg.Target.Servers)
	for i, c := range NewClients(*cfg, cfg.Target.Servers...) {
		env.Servers = append(env.Servers, &harbor.Server{URL: strings.TrimRight(cfg.Target.Servers[i], "/"), Label: labels[i], RPC: c, Rec: rec})
	}
	if cfg.Target.WebURL != "" {
		env.Web = NewClients(*cfg, cfg.Target.WebURL)[0]
	}
	return env
}

func newRun(e *Engine, cfg config.Config) (*Run, error) {
	now := time.Now()
	r := &Run{
		e:         e,
		ID:        now.Format("20060102-150405"),
		cfg:       cfg.Clone(),
		rec:       stats.NewRecorder(),
		executors: map[string]*Executor{},
		Started:   now,
		done:      make(chan struct{}),
	}
	r.env = NewEnv(&r.cfg, r.rec, e.accounts, e.posts)
	r.env.OnAccount = func(*polycentric.Account) {
		r.dirtyMu.Lock()
		r.dirty = true
		r.dirtyMu.Unlock()
	}
	if cfg.Run.ResultsDir != "" {
		r.dir = filepath.Join(cfg.Run.ResultsDir, r.ID)
		if err := os.MkdirAll(r.dir, 0o755); err != nil {
			return nil, err
		}
		if raw, err := yaml.Marshal(cfg); err == nil {
			_ = os.WriteFile(filepath.Join(r.dir, "config.yaml"), raw, 0o644)
		}
		f, err := os.Create(filepath.Join(r.dir, "ticks.jsonl"))
		if err != nil {
			return nil, err
		}
		r.tickF = f
	}
	r.schedCtx, r.schedCancel = context.WithCancel(context.Background())
	r.iterCtx, r.iterCancel = context.WithCancel(context.Background())
	for _, s := range Scenarios {
		sc, ok := cfg.Scenarios[s.Name]
		if !ok {
			continue
		}
		ex := &Executor{
			Name:        s.Name,
			Run:         s.New(r.env, config.Params(sc.Params)),
			StartRate:   sc.Rate,
			MaxInFlight: sc.MaxInFlight,
		}
		for _, st := range sc.Stages {
			ex.Stages = append(ex.Stages, Stage{Duration: st.Duration.D(), Target: st.Target})
		}
		if len(ex.Stages) > 0 {
			ex.StartRate = 0
		}
		ex.SetEnabled(sc.Enabled)
		r.executors[s.Name] = ex
		r.order = append(r.order, s.Name)
	}
	return r, nil
}

// plannedDuration is run.duration, or the longest enabled stage plan.
func (r *Run) plannedDuration() time.Duration {
	if d := r.cfg.Run.Duration.D(); d > 0 {
		return d
	}
	var longest time.Duration
	for name, ex := range r.executors {
		if r.cfg.Scenarios[name].Enabled {
			longest = max(longest, ex.StagesDuration())
		}
	}
	return longest
}

func (r *Run) loop() {
	defer close(r.done)
	for _, name := range r.order {
		go r.executors[name].Loop(r.schedCtx, r.iterCtx)
	}
	planned := r.plannedDuration()
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	save := time.NewTicker(30 * time.Second)
	defer save.Stop()
	for {
		select {
		case <-r.schedCtx.Done():
			r.finish()
			return
		case <-save.C:
			r.saveAccounts()
		case now := <-tick.C:
			t := r.sample(now)
			r.e.pub.Publish("tick", t)
			r.checkSafety()
			if planned > 0 && now.Sub(r.Started) >= planned {
				go r.stop("planned duration reached")
			}
		}
	}
}

func (r *Run) sample(now time.Time) Tick {
	t := Tick{
		T:        now.UnixMilli(),
		Elapsed:  now.Sub(r.Started).Seconds(),
		Ops:      r.rec.Rotate(),
		Posts:    r.env.Posts.Len(),
		Routines: runtime.NumGoroutine(),
	}
	a, b, c := r.env.Accounts.Counts()
	t.Accounts = [3]int{a, b, c}
	for _, name := range r.order {
		t.Scenarios = append(t.Scenarios, r.executors[name].Stats())
	}
	r.hmu.Lock()
	r.ticks = append(r.ticks, t)
	if len(r.ticks) > 7200 {
		r.ticks = r.ticks[len(r.ticks)-7200:]
	}
	if r.tickF != nil {
		if raw, err := json.Marshal(t); err == nil {
			r.tickF.Write(append(raw, '\n'))
		}
	}
	r.hmu.Unlock()
	return t
}

func (r *Run) history() []Tick {
	r.hmu.Lock()
	defer r.hmu.Unlock()
	return append([]Tick(nil), r.ticks...)
}

// isBlock reports error classes that mean the edge is refusing us.
func isBlock(class string) bool {
	return class == "http:403" || class == "http:429" || strings.HasPrefix(class, "http:10")
}

// checkSafety pauses the run when the edge starts blocking, or when the
// overall error rate crosses the configured ceiling.
func (r *Run) checkSafety() {
	r.hmu.Lock()
	n := len(r.ticks)
	window := func(sec int) (total, errs, blocks int64) {
		for _, t := range r.ticks[max(0, n-sec):] {
			for name, op := range t.Ops {
				if name == "skipped" || strings.HasPrefix(name, "session:") || strings.HasPrefix(name, "flow:") || strings.HasPrefix(name, harbor.AllPrefix) {
					continue
				}
				total += op.Count
				errs += op.Errors
				for class, c := range op.ErrorsBy {
					if isBlock(class) {
						blocks += c
					}
				}
			}
		}
		return
	}
	total10, _, blocks10 := window(10)
	total30, errs30, _ := window(30)
	r.hmu.Unlock()

	r.e.mu.Lock()
	paused := r.paused
	r.e.mu.Unlock()
	if paused {
		return
	}
	s := r.cfg.Safety
	if s.PauseOnBlock && total10 >= 20 && float64(blocks10)/float64(total10) > s.BlockThreshold {
		r.e.SetPaused(true, fmt.Sprintf("%d of %d requests in the last 10s were refused by the edge (403/429). The harbor.social Cloudflare zone is shared with production, so continuing risks an IP ban that also blocks prod.", blocks10, total10))
		return
	}
	if s.MaxErrorRate > 0 && total30 >= 50 && float64(errs30)/float64(total30) > s.MaxErrorRate {
		r.e.SetPaused(true, fmt.Sprintf("error rate %.0f%% over the last 30s exceeds safety.maxErrorRate", 100*float64(errs30)/float64(total30)))
	}
}

func (r *Run) stop(reason string) {
	r.stopOnce.Do(func() {
		r.e.mu.Lock()
		r.stopping = true
		r.stopReason = reason
		r.e.note("info", "Stopping: "+reason)
		r.e.publishStatusLocked()
		r.e.mu.Unlock()
		r.schedCancel()
	})
}

func (r *Run) finish() {
	// Let in-flight iterations finish, up to the grace period.
	drained := make(chan struct{})
	go func() {
		for _, ex := range r.executors {
			ex.Wait()
		}
		close(drained)
	}()
	// Keep sampling every second while draining so rates stay per-second.
	grace := time.NewTimer(r.cfg.Run.GracefulStop.D())
	defer grace.Stop()
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
wait:
	for {
		select {
		case <-drained:
			break wait
		case <-grace.C:
			r.iterCancel()
			<-drained
			break wait
		case now := <-tick.C:
			r.e.pub.Publish("tick", r.sample(now))
		}
	}
	r.iterCancel()
	r.Ended = time.Now()
	final := r.sample(r.Ended)
	r.e.pub.Publish("tick", final)
	if r.tickF != nil {
		r.tickF.Close()
	}
	r.saveAccounts()
	r.writeSummary()

	r.e.mu.Lock()
	r.e.last, r.e.run = r, nil
	r.e.note("info", fmt.Sprintf("Run %s finished (%s) after %s", r.ID, r.stopReason, r.Ended.Sub(r.Started).Round(time.Second)))
	r.e.publishStatusLocked()
	r.e.mu.Unlock()
}

func (r *Run) saveAccounts() {
	r.dirtyMu.Lock()
	dirty := r.dirty
	r.dirty = false
	r.dirtyMu.Unlock()
	if !dirty || r.cfg.Run.AccountsFile == "" {
		return
	}
	if err := r.env.Accounts.Save(r.cfg.Run.AccountsFile); err != nil {
		r.e.Note("error", "saving accounts: "+err.Error())
	}
}

// Summary is the end-of-run report written to summary.json.
type Summary struct {
	RunID     string                      `json:"runId"`
	Started   time.Time                   `json:"started"`
	Ended     time.Time                   `json:"ended"`
	Reason    string                      `json:"reason"`
	Targets   []string                    `json:"targets"`
	Totals    map[string]stats.OpSnapshot `json:"totals"`
	Scenarios []ExecutorStats             `json:"scenarios"`
	Errors    map[string]string           `json:"errorSamples"`
	Accounts  [3]int                      `json:"accounts"`
}

func (r *Run) Summary() Summary {
	s := Summary{
		RunID:   r.ID,
		Started: r.Started,
		Ended:   r.Ended,
		Reason:  r.stopReason,
		Targets: r.cfg.Target.Servers,
		Totals:  r.rec.Totals(),
		Errors:  r.rec.ErrorSamples(),
	}
	for _, name := range r.order {
		s.Scenarios = append(s.Scenarios, r.executors[name].Stats())
	}
	a, b, c := r.env.Accounts.Counts()
	s.Accounts = [3]int{a, b, c}
	return s
}

func (r *Run) writeSummary() {
	if r.dir == "" {
		return
	}
	raw, err := json.MarshalIndent(r.Summary(), "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(filepath.Join(r.dir, "summary.json"), raw, 0o644)
}

// LastSummary returns the summary of the current or last run.
func (e *Engine) LastSummary() (Summary, bool) {
	e.mu.Lock()
	r := e.run
	if r == nil {
		r = e.last
	}
	e.mu.Unlock()
	if r == nil {
		return Summary{}, false
	}
	return r.Summary(), true
}

// ErrorSamples of the current or last run, sorted by key.
func (e *Engine) ErrorSamples() [][2]string {
	e.mu.Lock()
	r := e.run
	if r == nil {
		r = e.last
	}
	e.mu.Unlock()
	if r == nil {
		return nil
	}
	m := r.rec.ErrorSamples()
	out := make([][2]string, 0, len(m))
	for k, v := range m {
		out = append(out, [2]string{k, v})
	}
	sort.Slice(out, func(i, j int) bool { return out[i][0] < out[j][0] })
	return out
}
