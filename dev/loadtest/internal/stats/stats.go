// Package stats aggregates client-side measurements per operation into
// per-second windows and whole-run totals.
package stats

import (
	"sort"
	"sync"
	"time"

	"github.com/HdrHistogram/hdrhistogram-go"
)

const (
	minMicros = 1
	maxMicros = 300_000_000 // 5 minutes
	sigFigs   = 3
)

// OpSnapshot is the summary of one operation over some interval.
type OpSnapshot struct {
	Count    int64            `json:"count"`
	Errors   int64            `json:"errors"`
	BytesIn  int64            `json:"bytesIn"`
	BytesOut int64            `json:"bytesOut"`
	MeanMs   float64          `json:"meanMs"`
	P50Ms    float64          `json:"p50Ms"`
	P90Ms    float64          `json:"p90Ms"`
	P95Ms    float64          `json:"p95Ms"`
	P99Ms    float64          `json:"p99Ms"`
	MaxMs    float64          `json:"maxMs"`
	ErrorsBy map[string]int64 `json:"errorsBy,omitempty"`
}

type acc struct {
	hist     *hdrhistogram.Histogram
	count    int64
	errors   int64
	bytesIn  int64
	bytesOut int64
	errorsBy map[string]int64
}

func newAcc() *acc {
	return &acc{hist: hdrhistogram.New(minMicros, maxMicros, sigFigs), errorsBy: map[string]int64{}}
}

func (a *acc) add(us int64, reqBytes, respBytes int, errClass string) {
	if us < minMicros {
		us = minMicros
	}
	if us > maxMicros {
		us = maxMicros
	}
	_ = a.hist.RecordValue(us)
	a.count++
	a.bytesOut += int64(reqBytes)
	a.bytesIn += int64(respBytes)
	if errClass != "" {
		a.errors++
		a.errorsBy[errClass]++
	}
}

func (a *acc) snapshot() OpSnapshot {
	s := OpSnapshot{
		Count:    a.count,
		Errors:   a.errors,
		BytesIn:  a.bytesIn,
		BytesOut: a.bytesOut,
	}
	if a.count > 0 {
		s.MeanMs = a.hist.Mean() / 1000
		s.P50Ms = float64(a.hist.ValueAtQuantile(50)) / 1000
		s.P90Ms = float64(a.hist.ValueAtQuantile(90)) / 1000
		s.P95Ms = float64(a.hist.ValueAtQuantile(95)) / 1000
		s.P99Ms = float64(a.hist.ValueAtQuantile(99)) / 1000
		s.MaxMs = float64(a.hist.Max()) / 1000
	}
	if len(a.errorsBy) > 0 {
		s.ErrorsBy = make(map[string]int64, len(a.errorsBy))
		for k, v := range a.errorsBy {
			s.ErrorsBy[k] = v
		}
	}
	return s
}

func (a *acc) reset() {
	a.hist.Reset()
	a.count, a.errors, a.bytesIn, a.bytesOut = 0, 0, 0, 0
	clear(a.errorsBy)
}

type opStats struct {
	mu  sync.Mutex
	win *acc
	cum *acc
}

// Recorder is safe for concurrent use.
type Recorder struct {
	mu  sync.RWMutex
	ops map[string]*opStats

	errMu     sync.Mutex
	errSample map[string]string // error class -> most recent message
}

func NewRecorder() *Recorder {
	return &Recorder{ops: map[string]*opStats{}, errSample: map[string]string{}}
}

func (r *Recorder) op(name string) *opStats {
	r.mu.RLock()
	o := r.ops[name]
	r.mu.RUnlock()
	if o != nil {
		return o
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if o = r.ops[name]; o == nil {
		o = &opStats{win: newAcc(), cum: newAcc()}
		r.ops[name] = o
	}
	return o
}

// Record adds one measurement. errClass is empty on success.
func (r *Recorder) Record(op string, d time.Duration, reqBytes, respBytes int, errClass string) {
	o := r.op(op)
	us := d.Microseconds()
	o.mu.Lock()
	o.win.add(us, reqBytes, respBytes, errClass)
	o.cum.add(us, reqBytes, respBytes, errClass)
	o.mu.Unlock()
}

// NoteError keeps the latest message per error class so the UI can show
// what a class actually means.
func (r *Recorder) NoteError(op, class, msg string) {
	if len(msg) > 300 {
		msg = msg[:300]
	}
	r.errMu.Lock()
	r.errSample[op+" "+class] = msg
	r.errMu.Unlock()
}

// ErrorSamples returns the latest message per "op class".
func (r *Recorder) ErrorSamples() map[string]string {
	r.errMu.Lock()
	defer r.errMu.Unlock()
	out := make(map[string]string, len(r.errSample))
	for k, v := range r.errSample {
		out[k] = v
	}
	return out
}

// Rotate returns the current window per op and starts a new one.
func (r *Recorder) Rotate() map[string]OpSnapshot {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make(map[string]OpSnapshot, len(r.ops))
	for name, o := range r.ops {
		o.mu.Lock()
		if o.win.count > 0 {
			out[name] = o.win.snapshot()
		}
		o.win.reset()
		o.mu.Unlock()
	}
	return out
}

// Totals returns whole-run summaries per op.
func (r *Recorder) Totals() map[string]OpSnapshot {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make(map[string]OpSnapshot, len(r.ops))
	for name, o := range r.ops {
		o.mu.Lock()
		out[name] = o.cum.snapshot()
		o.mu.Unlock()
	}
	return out
}

// Names returns the sorted operation names seen so far.
func (r *Recorder) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, 0, len(r.ops))
	for n := range r.ops {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}
