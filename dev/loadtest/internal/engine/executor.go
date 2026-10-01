package engine

import (
	"context"
	"math"
	"sync"
	"sync/atomic"
	"time"
)

// Stage ramps the arrival rate linearly to Target (per second) over Duration.
type Stage struct {
	Duration time.Duration `json:"duration"`
	Target   float64       `json:"target"`
}

// Runner executes one iteration of a scenario (one visitor session, one
// registration, one post, ...).
type Runner func(ctx context.Context) error

// ExecutorStats is a point-in-time view of one executor.
type ExecutorStats struct {
	Name        string  `json:"name"`
	TargetRate  float64 `json:"targetRate"`
	Arrivals    int64   `json:"arrivals"`
	Started     int64   `json:"started"`
	Completed   int64   `json:"completed"`
	Failed      int64   `json:"failed"`
	Dropped     int64   `json:"dropped"`
	InFlight    int64   `json:"inFlight"`
	MaxInFlight int     `json:"maxInFlight"`
	Manual      bool    `json:"manual"`
	Enabled     bool    `json:"enabled"`
}

// Executor drives a Runner at an open-model arrival rate: iterations start
// on schedule regardless of how long earlier ones take, so a slow server
// shows up as growing concurrency and latency rather than silently lower
// load. When MaxInFlight is reached, arrivals are counted as dropped.
type Executor struct {
	Name        string
	Run         Runner
	Stages      []Stage
	StartRate   float64
	MaxInFlight int

	mu        sync.Mutex
	manual    bool
	manualVal float64
	disabled  bool
	hold      bool

	arrivals  atomic.Int64
	started   atomic.Int64
	completed atomic.Int64
	failed    atomic.Int64
	dropped   atomic.Int64
	inflight  atomic.Int64

	begin   time.Time
	current atomic.Uint64 // float64 bits of the rate in effect
	wg      sync.WaitGroup
}

// SetRate pins the rate (overriding stages) until ClearRate.
func (e *Executor) SetRate(r float64) {
	e.mu.Lock()
	e.manual, e.manualVal = true, math.Max(0, r)
	e.mu.Unlock()
}

// ClearRate returns control to the configured stages.
func (e *Executor) ClearRate() {
	e.mu.Lock()
	e.manual = false
	e.mu.Unlock()
}

// SetEnabled turns the scenario on or off without touching its rate.
func (e *Executor) SetEnabled(on bool) {
	e.mu.Lock()
	e.disabled = !on
	e.mu.Unlock()
}

// Hold suspends arrivals regardless of enablement (the global pause).
func (e *Executor) Hold(h bool) {
	e.mu.Lock()
	e.hold = h
	e.mu.Unlock()
}

// SetMaxInFlight adjusts the concurrency cap live.
func (e *Executor) SetMaxInFlight(n int) {
	e.mu.Lock()
	e.MaxInFlight = n
	e.mu.Unlock()
}

// StagesDuration is the total length of the configured stages.
func (e *Executor) StagesDuration() time.Duration {
	var d time.Duration
	for _, s := range e.Stages {
		d += s.Duration
	}
	return d
}

func (e *Executor) rateAt(elapsed time.Duration) float64 {
	e.mu.Lock()
	manual, mv, off := e.manual, e.manualVal, e.disabled || e.hold
	e.mu.Unlock()
	if off {
		return 0
	}
	if manual {
		return mv
	}
	prev := e.StartRate
	for _, s := range e.Stages {
		if elapsed < s.Duration {
			if s.Duration <= 0 {
				return s.Target
			}
			f := float64(elapsed) / float64(s.Duration)
			return prev + (s.Target-prev)*f
		}
		elapsed -= s.Duration
		prev = s.Target
	}
	return prev
}

func (e *Executor) maxInFlight() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.MaxInFlight
}

// Loop schedules arrivals until ctx is done. Iterations receive iterCtx,
// which the engine cancels separately to allow a graceful drain.
func (e *Executor) Loop(ctx, iterCtx context.Context) {
	const tick = 10 * time.Millisecond
	e.begin = time.Now()
	t := time.NewTicker(tick)
	defer t.Stop()
	last := e.begin
	due := 0.0
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-t.C:
			rate := e.rateAt(now.Sub(e.begin))
			e.current.Store(math.Float64bits(rate))
			due += rate * now.Sub(last).Seconds()
			last = now
			// Never let a backlog build up across pauses or GC stalls.
			if due > rate+1 {
				due = rate + 1
			}
			for due >= 1 {
				due--
				e.arrive(iterCtx)
			}
		}
	}
}

func (e *Executor) arrive(ctx context.Context) {
	e.arrivals.Add(1)
	if max := e.maxInFlight(); max > 0 && e.inflight.Load() >= int64(max) {
		e.dropped.Add(1)
		return
	}
	e.inflight.Add(1)
	e.started.Add(1)
	e.wg.Add(1)
	go func() {
		defer e.wg.Done()
		defer e.inflight.Add(-1)
		if err := e.Run(ctx); err != nil {
			e.failed.Add(1)
			return
		}
		e.completed.Add(1)
	}()
}

// Wait blocks until all started iterations have returned.
func (e *Executor) Wait() { e.wg.Wait() }

func (e *Executor) Stats() ExecutorStats {
	e.mu.Lock()
	manual := e.manual
	max := e.MaxInFlight
	enabled := !e.disabled
	e.mu.Unlock()
	return ExecutorStats{
		Name:        e.Name,
		TargetRate:  math.Float64frombits(e.current.Load()),
		Arrivals:    e.arrivals.Load(),
		Started:     e.started.Load(),
		Completed:   e.completed.Load(),
		Failed:      e.failed.Load(),
		Dropped:     e.dropped.Load(),
		InFlight:    e.inflight.Load(),
		MaxInFlight: max,
		Manual:      manual,
		Enabled:     enabled,
	}
}
