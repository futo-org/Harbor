package engine

import (
	"context"
	"math"
	"testing"
	"time"
)

func runFor(ex *Executor, d time.Duration) {
	ctx, cancel := context.WithTimeout(context.Background(), d)
	defer cancel()
	ex.Loop(ctx, context.Background())
	ex.Wait()
}

func TestExecutorRate(t *testing.T) {
	ex := &Executor{Name: "x", StartRate: 200, Run: func(context.Context) error { return nil }}
	runFor(ex, time.Second)
	st := ex.Stats()
	if math.Abs(float64(st.Arrivals)-200) > 20 {
		t.Fatalf("arrivals = %d, want ~200", st.Arrivals)
	}
	if st.Completed != st.Arrivals || st.Dropped != 0 {
		t.Fatalf("stats = %+v", st)
	}
}

func TestExecutorRamp(t *testing.T) {
	ex := &Executor{Name: "x", Stages: []Stage{{Duration: time.Second, Target: 200}}, Run: func(context.Context) error { return nil }}
	if r := ex.rateAt(500 * time.Millisecond); math.Abs(r-100) > 1e-9 {
		t.Fatalf("rate at half the ramp = %v", r)
	}
	if r := ex.rateAt(5 * time.Second); r != 200 {
		t.Fatalf("rate after the ramp = %v", r)
	}
	runFor(ex, time.Second)
	if a := ex.Stats().Arrivals; a < 80 || a > 120 {
		t.Fatalf("arrivals over a 0→200 ramp = %d, want ~100", a)
	}
}

func TestExecutorDropsBeyondMaxInFlight(t *testing.T) {
	block := make(chan struct{})
	ex := &Executor{Name: "x", StartRate: 100, MaxInFlight: 5, Run: func(ctx context.Context) error { <-block; return nil }}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	ex.Loop(ctx, context.Background())
	cancel()
	st := ex.Stats()
	close(block)
	ex.Wait()
	if st.InFlight != 5 || st.Dropped == 0 || st.Started != 5 {
		t.Fatalf("stats = %+v", st)
	}
}

func TestExecutorHoldAndManualRate(t *testing.T) {
	ex := &Executor{Name: "x", StartRate: 100, Run: func(context.Context) error { return nil }}
	ex.Hold(true)
	if ex.rateAt(0) != 0 {
		t.Fatal("hold must stop arrivals")
	}
	ex.Hold(false)
	ex.SetRate(7)
	if ex.rateAt(0) != 7 {
		t.Fatal("manual rate not applied")
	}
	ex.SetEnabled(false)
	if ex.rateAt(0) != 0 {
		t.Fatal("disabled scenario must not arrive")
	}
}
