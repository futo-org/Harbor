package config

import "testing"

func TestPartialScenarioOverride(t *testing.T) {
	cfg, err := parse([]byte(`
run: {duration: 2m}
scenarios:
  browse: {rate: 5, params: {threadProb: 0.9}}
  repost: {enabled: true}
  post: {enabled: false}
`), "test")
	if err != nil {
		t.Fatal(err)
	}
	b := cfg.Scenarios["browse"]
	if !b.Enabled || b.Rate != 5 || b.MaxInFlight != 2000 {
		t.Fatalf("browse = %+v", b)
	}
	if Params(b.Params).Float("threadProb", 0) != 0.9 || Params(b.Params).Float("sortTopShare", 0) != 0.8 {
		t.Fatalf("browse params not merged: %v", b.Params)
	}
	if !cfg.Scenarios["repost"].Enabled || cfg.Scenarios["repost"].Rate != 0.1 {
		t.Fatalf("repost = %+v", cfg.Scenarios["repost"])
	}
	if cfg.Scenarios["post"].Enabled {
		t.Fatal("post should be disabled")
	}
	if !cfg.Scenarios["register"].Enabled {
		t.Fatal("unlisted scenarios keep their defaults")
	}
	if cfg.Run.Duration.D().Minutes() != 2 || cfg.Run.GracefulStop.D().Seconds() != 30 {
		t.Fatalf("run = %+v", cfg.Run)
	}
	if len(cfg.Target.Servers) != 2 {
		t.Fatalf("servers = %v", cfg.Target.Servers)
	}
}

func TestStagingGuard(t *testing.T) {
	if _, err := parse([]byte("target: {servers: [https://srv.harbor.social]}"), "test"); err == nil {
		t.Fatal("expected production host to be refused")
	}
	if _, err := parse([]byte("target: {servers: [https://srv.harbor.social], allowNonStaging: true, webURL: https://harbor.social}"), "test"); err != nil {
		t.Fatal(err)
	}
}
