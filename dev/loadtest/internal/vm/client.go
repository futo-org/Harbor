// Package vm queries VictoriaMetrics (Prometheus HTTP API) for server-side
// resource and application metrics while a test runs.
package vm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Client talks to a Prometheus-compatible select endpoint, e.g.
// https://vmetrics.staging.o11y.futo.network/select/3:1/prometheus
type Client struct {
	BaseURL string
	HTTP    *http.Client
}

// Series is one labelled time series. Values holds NaN for gaps.
type Series struct {
	Labels map[string]string `json:"labels"`
	Name   string            `json:"name"`
	Times  []int64           `json:"t"` // unix seconds
	Values Floats            `json:"v"`
}

// Floats marshals NaN and ±Inf as null (JSON has no representation).
type Floats []float64

func (f Floats) MarshalJSON() ([]byte, error) {
	b := make([]byte, 0, len(f)*8+2)
	b = append(b, '[')
	for i, v := range f {
		if i > 0 {
			b = append(b, ',')
		}
		if math.IsNaN(v) || math.IsInf(v, 0) {
			b = append(b, "null"...)
		} else {
			b = strconv.AppendFloat(b, v, 'g', 6, 64)
		}
	}
	return append(b, ']'), nil
}

type apiResponse struct {
	Status    string `json:"status"`
	ErrorType string `json:"errorType"`
	Error     string `json:"error"`
	Data      struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Metric map[string]string `json:"metric"`
			Values [][2]any          `json:"values"`
			Value  [2]any            `json:"value"`
		} `json:"result"`
	} `json:"data"`
}

func (c *Client) get(ctx context.Context, path string, params url.Values) (*apiResponse, error) {
	u := strings.TrimRight(c.BaseURL, "/") + path + "?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return nil, err
	}
	var ar apiResponse
	if err := json.Unmarshal(body, &ar); err != nil {
		snippet := string(body)
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return nil, fmt.Errorf("vm %s: HTTP %d: %s", path, resp.StatusCode, snippet)
	}
	if ar.Status != "success" {
		return nil, fmt.Errorf("vm %s: %s: %s", path, ar.ErrorType, ar.Error)
	}
	return &ar, nil
}

// QueryRange evaluates query over [start, end] at step resolution.
// legend is a Go-template-ish format using {{label}} placeholders; empty
// uses all labels.
func (c *Client) QueryRange(ctx context.Context, query string, start, end time.Time, step time.Duration, legend string) ([]Series, error) {
	params := url.Values{}
	params.Set("query", query)
	params.Set("start", strconv.FormatInt(start.Unix(), 10))
	params.Set("end", strconv.FormatInt(end.Unix(), 10))
	params.Set("step", strconv.Itoa(int(step.Seconds()))+"s")
	// VictoriaMetrics hides the newest 30s by default; show the latest scrape.
	params.Set("latency_offset", "1s")
	ar, err := c.get(ctx, "/api/v1/query_range", params)
	if err != nil {
		return nil, err
	}
	out := make([]Series, 0, len(ar.Data.Result))
	for _, r := range ar.Data.Result {
		s := Series{Labels: r.Metric, Name: FormatLegend(legend, r.Metric)}
		for _, v := range r.Values {
			ts, ok := v[0].(float64)
			if !ok {
				continue
			}
			s.Times = append(s.Times, int64(ts))
			s.Values = append(s.Values, parseValue(v[1]))
		}
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// Query evaluates an instant query.
func (c *Client) Query(ctx context.Context, query string, at time.Time) ([]Series, error) {
	params := url.Values{}
	params.Set("query", query)
	if !at.IsZero() {
		params.Set("time", strconv.FormatInt(at.Unix(), 10))
	}
	ar, err := c.get(ctx, "/api/v1/query", params)
	if err != nil {
		return nil, err
	}
	out := make([]Series, 0, len(ar.Data.Result))
	for _, r := range ar.Data.Result {
		ts, _ := r.Value[0].(float64)
		out = append(out, Series{
			Labels: r.Metric,
			Name:   FormatLegend("", r.Metric),
			Times:  []int64{int64(ts)},
			Values: Floats{parseValue(r.Value[1])},
		})
	}
	return out, nil
}

func parseValue(v any) float64 {
	s, ok := v.(string)
	if !ok {
		return math.NaN()
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return math.NaN()
	}
	return f
}

// FormatLegend substitutes {{label}} placeholders.
func FormatLegend(legend string, labels map[string]string) string {
	if legend == "" {
		keys := make([]string, 0, len(labels))
		for k := range labels {
			if k != "__name__" {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, k := range keys {
			parts = append(parts, k+"="+labels[k])
		}
		if len(parts) == 0 {
			return labels["__name__"]
		}
		return strings.Join(parts, ",")
	}
	var b strings.Builder
	for {
		i := strings.Index(legend, "{{")
		if i < 0 {
			b.WriteString(legend)
			break
		}
		j := strings.Index(legend[i:], "}}")
		if j < 0 {
			b.WriteString(legend)
			break
		}
		b.WriteString(legend[:i])
		b.WriteString(labels[strings.TrimSpace(legend[i+2:i+j])])
		legend = legend[i+j+2:]
	}
	return b.String()
}
