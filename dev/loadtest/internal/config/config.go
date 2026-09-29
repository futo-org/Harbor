// Package config defines the load-test configuration (YAML on disk, JSON
// over the dashboard API).
package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"code.futo.org/harbor/harbor/dev/loadtest/internal/vm"
	"gopkg.in/yaml.v3"
)

// Duration marshals as a Go duration string ("90s", "5m") in YAML and JSON.
type Duration time.Duration

func (d Duration) D() time.Duration { return time.Duration(d) }

func (d Duration) MarshalYAML() (any, error) { return time.Duration(d).String(), nil }

func (d *Duration) UnmarshalYAML(n *yaml.Node) error {
	var s string
	if err := n.Decode(&s); err != nil {
		return err
	}
	return d.parse(s)
}

func (d Duration) MarshalJSON() ([]byte, error) {
	return []byte(`"` + time.Duration(d).String() + `"`), nil
}

func (d *Duration) UnmarshalJSON(b []byte) error {
	return d.parse(strings.Trim(string(b), `"`))
}

func (d *Duration) parse(s string) error {
	if s == "" || s == "0" {
		*d = 0
		return nil
	}
	v, err := time.ParseDuration(s)
	if err != nil {
		return err
	}
	*d = Duration(v)
	return nil
}

// Range is a uniformly sampled [Min, Max] interval.
type Range[T int | float64 | Duration] struct {
	Min T `yaml:"min" json:"min"`
	Max T `yaml:"max" json:"max"`
}

type Config struct {
	Target    Target              `yaml:"target" json:"target"`
	Metrics   Metrics             `yaml:"metrics" json:"metrics"`
	Run       Run                 `yaml:"run" json:"run"`
	Safety    Safety              `yaml:"safety" json:"safety"`
	Content   Content             `yaml:"content" json:"content"`
	Scenarios map[string]Scenario `yaml:"scenarios" json:"scenarios"`
}

type Target struct {
	// WebURL is the web app origin (sent as Origin; its HTML is fetched by
	// visitors when browse.loadWebApp is on).
	WebURL string `yaml:"webURL" json:"webURL"`
	// Servers are the seed servers, in the app's order. The first is used for
	// blob and image-proxy GETs.
	Servers []string `yaml:"servers" json:"servers"`
	// Fanout "all" sends every RPC to every server in parallel, as the app
	// does; "first" only uses Servers[0].
	Fanout          string   `yaml:"fanout" json:"fanout"`
	UserAgent       string   `yaml:"userAgent" json:"userAgent"`
	Timeout         Duration `yaml:"timeout" json:"timeout"`
	ConnectionPools int      `yaml:"connectionPools" json:"connectionPools"`
	// AllowNonStaging must be set to target a host without "staging",
	// "localhost" or "127.0.0.1" in its name.
	AllowNonStaging bool `yaml:"allowNonStaging" json:"allowNonStaging"`
}

type Metrics struct {
	Enabled  bool     `yaml:"enabled" json:"enabled"`
	URL      string   `yaml:"url" json:"url"`
	Interval Duration `yaml:"interval" json:"interval"`
	Step     Duration `yaml:"step" json:"step"`
	// Lookback is how much history before the run starts is shown.
	Lookback Duration `yaml:"lookback" json:"lookback"`
	Scope    vm.Scope `yaml:"scope" json:"scope"`
}

type Run struct {
	// Duration stops the test automatically; 0 runs until stopped (or until
	// the longest scenario's stages finish, if any scenario has stages).
	Duration     Duration `yaml:"duration" json:"duration"`
	GracefulStop Duration `yaml:"gracefulStop" json:"gracefulStop"`
	ResultsDir   string   `yaml:"resultsDir" json:"resultsDir"`
	// AccountsFile persists created identities (with private keys) so later
	// runs reuse them and cleanup can find them.
	AccountsFile string `yaml:"accountsFile" json:"accountsFile"`
}

type Safety struct {
	// PauseOnBlock pauses every scenario when the edge starts refusing us
	// (HTTP 403/429/1xxx from Cloudflare) above BlockThreshold of requests
	// over the last 10s. The harbor.social zone is shared with production,
	// so a WAF ban on this machine's IP would also block production.
	PauseOnBlock   bool    `yaml:"pauseOnBlock" json:"pauseOnBlock"`
	BlockThreshold float64 `yaml:"blockThreshold" json:"blockThreshold"`
	// MaxErrorRate pauses everything when the error ratio over 30s exceeds
	// it (0 disables).
	MaxErrorRate float64 `yaml:"maxErrorRate" json:"maxErrorRate"`
}

type Content struct {
	// UniquePosts appends a random token to every post so each has a unique
	// content digest. Moderation sends each new digest to Azure Content
	// Safety (a paid call); with false, posts are drawn from a corpus of
	// CorpusSize texts and Azure sees at most that many distinct contents.
	UniquePosts bool `yaml:"uniquePosts" json:"uniquePosts"`
	CorpusSize  int  `yaml:"corpusSize" json:"corpusSize"`
	// InteractWithReal lets replies, reactions, reposts and quotes target
	// posts by real staging users (they would get notifications). Off by
	// default: only load-test content is touched.
	InteractWithReal bool `yaml:"interactWithReal" json:"interactWithReal"`
	// LoadtestLabel adds the "loadtest" self-label to posts.
	LoadtestLabel bool `yaml:"loadtestLabel" json:"loadtestLabel"`
	// NamePrefix starts every display name (keep it distinctive; staging CI
	// searches for its own seeded users by name).
	NamePrefix string `yaml:"namePrefix" json:"namePrefix"`
	// ImageVariants are generated JPEG sizes (longest edge) per image,
	// matching the app's 512/1280 post variants.
	ImageVariants []int `yaml:"imageVariants" json:"imageVariants"`
	ImageCorpus   int   `yaml:"imageCorpus" json:"imageCorpus"`
}

// Scenario is one traffic source. Rate is arrivals per second (sessions for
// browse scenarios, actions for write scenarios).
type Scenario struct {
	Enabled     bool           `yaml:"enabled" json:"enabled"`
	Rate        float64        `yaml:"rate" json:"rate"`
	Stages      []Stage        `yaml:"stages,omitempty" json:"stages,omitempty"`
	MaxInFlight int            `yaml:"maxInFlight" json:"maxInFlight"`
	Params      map[string]any `yaml:"params,omitempty" json:"params,omitempty"`
}

type Stage struct {
	Duration Duration `yaml:"duration" json:"duration"`
	Target   float64  `yaml:"target" json:"target"`
}

// Default returns a conservative configuration for Harbor staging: every
// scenario is defined (so the dashboard can enable any of them) with modest
// rates.
func Default() Config {
	return Config{
		Target: Target{
			WebURL:          "https://staging.harbor.social",
			Servers:         []string{"https://srv.staging.harbor.social", "https://srv.staging.polycentric.io"},
			Fanout:          "all",
			UserAgent:       "harbor-loadtest/0.1 (+https://code.futo.org/harbor/harbor)",
			Timeout:         Duration(30 * time.Second),
			ConnectionPools: 4,
		},
		Metrics: Metrics{
			Enabled:  true,
			URL:      "https://vmetrics.staging.o11y.futo.network/select/3:1/prometheus",
			Interval: Duration(15 * time.Second),
			Step:     Duration(30 * time.Second),
			Lookback: Duration(15 * time.Minute),
			Scope:    vm.DefaultScope(),
		},
		Run: Run{
			Duration:     Duration(10 * time.Minute),
			GracefulStop: Duration(30 * time.Second),
			ResultsDir:   "results",
			AccountsFile: "state/accounts.jsonl",
		},
		Safety: Safety{PauseOnBlock: true, BlockThreshold: 0.2},
		Content: Content{
			CorpusSize:    500,
			LoadtestLabel: true,
			NamePrefix:    "Loadtest",
			ImageVariants: []int{512, 1280},
			ImageCorpus:   16,
		},
		Scenarios: DefaultScenarios(),
	}
}

func DefaultScenarios() map[string]Scenario {
	return map[string]Scenario{
		"browse": {Enabled: true, Rate: 2, MaxInFlight: 2000, Params: map[string]any{
			"scrollSteps":      map[string]any{"min": 1, "max": 6},
			"thinkTime":        map[string]any{"min": "2s", "max": "8s"},
			"sortTopShare":     0.8,
			"threadProb":       0.3,
			"profileProb":      0.2,
			"loadWebApp":       true,
			"loadStaticAssets": false,
			"images":           true,
			"imageProxy":       false,
			"cacheBust":        false,
			"preflightProb":    0.3,
			"rowsFirstRender":  12,
			"rowsPerScroll":    15,
		}},
		"browse_user": {Enabled: true, Rate: 1, MaxInFlight: 1000, Params: map[string]any{
			"scrollSteps":      map[string]any{"min": 1, "max": 6},
			"thinkTime":        map[string]any{"min": "2s", "max": "8s"},
			"landingFollowing": 0.7,
			"landingForYou":    0.15,
			"suggestFollow":    0.7,
			"threadProb":       0.3,
			"profileProb":      0.2,
			"notificationProb": 0.3,
			"images":           true,
			"imageProxy":       false,
			"cacheBust":        false,
			"authReads":        true,
			"rowsFirstRender":  12,
			"rowsPerScroll":    15,
		}},
		"register": {Enabled: true, Rate: 0.5, MaxInFlight: 500, Params: map[string]any{
			"followOnSignup":    5,
			"browseAfterSignup": true,
		}},
		"post": {Enabled: true, Rate: 0.5, MaxInFlight: 500, Params: map[string]any{
			"imageProb":   0.1,
			"quoteProb":   0.05,
			"mentionProb": 0.05,
			"textWords":   map[string]any{"min": 3, "max": 40},
		}},
		"reply": {Enabled: true, Rate: 0.2, MaxInFlight: 500, Params: map[string]any{
			"targetSkew": 1.0,
			"textWords":  map[string]any{"min": 2, "max": 25},
		}},
		"react": {Enabled: true, Rate: 1, MaxInFlight: 500, Params: map[string]any{
			"targetSkew":   1.0,
			"negativeProb": 0.05,
		}},
		"repost": {Enabled: false, Rate: 0.1, MaxInFlight: 200, Params: map[string]any{
			"targetSkew": 1.0,
		}},
		"follow": {Enabled: true, Rate: 0.2, MaxInFlight: 200},
		"search": {Enabled: false, Rate: 0.2, MaxInFlight: 200, Params: map[string]any{
			"usersShare": 0.3,
		}},
	}
}

// Clone deep-copies the parts of the config that are maps or slices.
func (c Config) Clone() Config {
	out := c
	out.Target.Servers = append([]string(nil), c.Target.Servers...)
	out.Content.ImageVariants = append([]int(nil), c.Content.ImageVariants...)
	out.Metrics.Scope.Namespaces = append([]string(nil), c.Metrics.Scope.Namespaces...)
	out.Metrics.Scope.ServerNamespaces = append([]string(nil), c.Metrics.Scope.ServerNamespaces...)
	out.Scenarios = make(map[string]Scenario, len(c.Scenarios))
	for k, v := range c.Scenarios {
		v.Stages = append([]Stage(nil), v.Stages...)
		params := make(map[string]any, len(v.Params))
		for pk, pv := range v.Params {
			params[pk] = pv
		}
		v.Params = params
		out.Scenarios[k] = v
	}
	return out
}

// Load reads a YAML file over the defaults. Each listed scenario is
// decoded on top of its default, so `browse: {rate: 5}` only changes the
// rate, and listed params merge into the default params.
func Load(path string) (Config, error) {
	cfg := Default()
	if path == "" {
		return cfg, nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	return parse(raw, path)
}

func parse(raw []byte, name string) (Config, error) {
	cfg := Default()
	cfg.Scenarios = nil // decoded separately below, on top of the defaults
	defaults := DefaultScenarios()
	var doc struct {
		Scenarios map[string]yaml.Node `yaml:"scenarios"`
	}
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return cfg, fmt.Errorf("%s: %w", name, err)
	}
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		return cfg, fmt.Errorf("%s: %w", name, err)
	}
	cfg.Scenarios = defaults
	for k, node := range doc.Scenarios {
		sc, ok := defaults[k]
		if !ok {
			return cfg, fmt.Errorf("%s: unknown scenario %q", name, k)
		}
		params := map[string]any{}
		for pk, pv := range sc.Params {
			params[pk] = pv
		}
		sc.Params = nil
		if err := node.Decode(&sc); err != nil {
			return cfg, fmt.Errorf("%s: scenarios.%s: %w", name, k, err)
		}
		for pk, pv := range sc.Params {
			params[pk] = pv
		}
		if len(params) > 0 {
			sc.Params = params
		}
		cfg.Scenarios[k] = sc
	}
	return cfg, cfg.Validate()
}

// Validate checks the configuration and the staging guard.
func (c *Config) Validate() error {
	if len(c.Target.Servers) == 0 {
		return fmt.Errorf("target.servers is empty")
	}
	hosts := append([]string{c.Target.WebURL}, c.Target.Servers...)
	for _, h := range hosts {
		if h == "" {
			continue
		}
		u, err := url.Parse(h)
		if err != nil || u.Scheme == "" || u.Host == "" {
			return fmt.Errorf("bad URL %q", h)
		}
		if !c.Target.AllowNonStaging && !looksSafe(u.Hostname()) {
			return fmt.Errorf("refusing to target %s: host is not staging/localhost (set target.allowNonStaging to override)", u.Hostname())
		}
	}
	switch c.Target.Fanout {
	case "all", "first":
	default:
		return fmt.Errorf("target.fanout must be all or first")
	}
	for name := range c.Scenarios {
		if _, ok := DefaultScenarios()[name]; !ok {
			return fmt.Errorf("unknown scenario %q", name)
		}
	}
	return nil
}

func looksSafe(host string) bool {
	h := strings.ToLower(host)
	return strings.Contains(h, "staging") || h == "localhost" || h == "127.0.0.1" || h == "::1" ||
		strings.HasSuffix(h, ".local") || strings.HasSuffix(h, ".internal")
}

// Params gives typed access to a scenario's free-form params with defaults.
type Params map[string]any

func (p Params) Float(key string, def float64) float64 {
	switch v := p[key].(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case int64:
		return float64(v)
	}
	return def
}

func (p Params) Int(key string, def int) int {
	return int(p.Float(key, float64(def)))
}

func (p Params) Bool(key string, def bool) bool {
	if v, ok := p[key].(bool); ok {
		return v
	}
	return def
}

func (p Params) IntRange(key string, def Range[int]) Range[int] {
	m, ok := p[key].(map[string]any)
	if !ok {
		return def
	}
	return Range[int]{Min: Params(m).Int("min", def.Min), Max: Params(m).Int("max", def.Max)}
}

func (p Params) DurationRange(key string, def Range[Duration]) Range[Duration] {
	m, ok := p[key].(map[string]any)
	if !ok {
		return def
	}
	r := def
	if s, ok := m["min"].(string); ok {
		if d, err := time.ParseDuration(s); err == nil {
			r.Min = Duration(d)
		}
	}
	if s, ok := m["max"].(string); ok {
		if d, err := time.ParseDuration(s); err == nil {
			r.Max = Duration(d)
		}
	}
	return r
}
