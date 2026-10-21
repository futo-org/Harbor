package vm

import (
	"context"
	"sort"
	"sync"
	"time"
)

// PanelResult is one panel's data for the dashboard.
type PanelResult struct {
	Panel
	Series []Series `json:"series"`
	Error  string   `json:"error,omitempty"`
}

// Snapshot is one poll of every panel.
type Snapshot struct {
	From    int64         `json:"from"` // unix seconds
	To      int64         `json:"to"`
	Step    int           `json:"step"`
	Fetched time.Time     `json:"fetched"`
	Panels  []PanelResult `json:"panels"`
	Error   string        `json:"error,omitempty"`
}

// Poller periodically evaluates the panel catalogue over a window chosen
// by Window (typically: the current run plus some lead-in).
type Poller struct {
	Client   *Client
	Panels   []Panel
	Scope    Scope
	Interval time.Duration
	Step     time.Duration
	Window   func(now time.Time) (from, to time.Time)
	OnResult func(Snapshot)

	mu   sync.Mutex
	last *Snapshot
}

func (p *Poller) Last() *Snapshot {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.last
}

// Run polls until ctx is done. Poke triggers an immediate poll.
func (p *Poller) Run(ctx context.Context, poke <-chan struct{}) {
	t := time.NewTicker(p.Interval)
	defer t.Stop()
	p.poll(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		case <-poke:
		}
		p.poll(ctx)
	}
}

func (p *Poller) poll(ctx context.Context) {
	now := time.Now()
	from, to := p.Window(now)
	step := p.Step
	if step < time.Second {
		step = 30 * time.Second
	}
	// Keep at most ~720 points per series.
	if span := to.Sub(from); span/step > 720 {
		step = (span / 720).Round(time.Second)
	}
	snap := Snapshot{From: from.Unix(), To: to.Unix(), Step: int(step.Seconds()), Fetched: now, Panels: make([]PanelResult, len(p.Panels))}
	sem := make(chan struct{}, 6)
	var wg sync.WaitGroup
	failures := 0
	var fmu sync.Mutex
	for i, panel := range p.Panels {
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			qctx, cancel := context.WithTimeout(ctx, 20*time.Second)
			defer cancel()
			series, err := p.Client.QueryRange(qctx, p.Scope.Expand(panel.Query), from, to, step, panel.Legend)
			res := PanelResult{Panel: panel, Series: series}
			if err != nil {
				res.Error = err.Error()
				fmu.Lock()
				failures++
				fmu.Unlock()
			}
			if panel.Component {
				res.Series = mergeComponents(res.Series, panel.Unit == "ratio")
			}
			snap.Panels[i] = res
		}()
	}
	wg.Wait()
	if failures == len(p.Panels) && failures > 0 {
		snap.Error = "metrics unreachable: " + snap.Panels[0].Error
	}
	p.mu.Lock()
	p.last = &snap
	p.mu.Unlock()
	if p.OnResult != nil {
		p.OnResult(snap)
	}
}

// mergeComponents renames series to component names and combines series
// that share one (sum, or max for ratios), aligning on timestamps.
func mergeComponents(in []Series, useMax bool) []Series {
	type agg struct {
		s   Series
		idx map[int64]int
	}
	byName := map[string]*agg{}
	var order []string
	for _, s := range in {
		name := ComponentName(s.Labels["namespace"], s.Labels["container"])
		a := byName[name]
		if a == nil {
			a = &agg{s: Series{Name: name, Labels: map[string]string{"component": name, "namespace": s.Labels["namespace"]}}, idx: map[int64]int{}}
			byName[name] = a
			order = append(order, name)
		}
		for i, t := range s.Times {
			v := s.Values[i]
			j, ok := a.idx[t]
			if !ok {
				a.idx[t] = len(a.s.Times)
				a.s.Times = append(a.s.Times, t)
				a.s.Values = append(a.s.Values, v)
				continue
			}
			cur := a.s.Values[j]
			switch {
			case cur != cur: // NaN
				a.s.Values[j] = v
			case v != v:
			case useMax:
				a.s.Values[j] = max(cur, v)
			default:
				a.s.Values[j] = cur + v
			}
		}
	}
	out := make([]Series, 0, len(order))
	for _, n := range order {
		s := byName[n].s
		sortSeries(&s)
		out = append(out, s)
	}
	return out
}

func sortSeries(s *Series) {
	idx := make([]int, len(s.Times))
	for i := range idx {
		idx[i] = i
	}
	sort.Slice(idx, func(a, b int) bool { return s.Times[idx[a]] < s.Times[idx[b]] })
	t := make([]int64, len(idx))
	v := make(Floats, len(idx))
	for i, j := range idx {
		t[i], v[i] = s.Times[j], s.Values[j]
	}
	s.Times, s.Values = t, v
}
