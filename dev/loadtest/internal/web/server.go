// Package web serves the live dashboard and its JSON/SSE API.
package web

import (
	"embed"
	"encoding/json"
	"io/fs"
	"net/http"
	"strings"
	"time"

	"code.futo.org/harbor/harbor/dev/loadtest/internal/config"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/engine"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/vm"
)

//go:embed static
var static embed.FS

type Server struct {
	Engine *engine.Engine
	Hub    *Hub
	Poller *vm.Poller // nil when metrics are disabled
	Poke   chan struct{}
}

type scenarioInfo struct {
	Name  string `json:"name"`
	Title string `json:"title"`
	Unit  string `json:"unit"`
}

type bootstrap struct {
	Status    engine.Status  `json:"status"`
	Scenarios []scenarioInfo `json:"scenarios"`
	History   []engine.Tick  `json:"history"`
	Metrics   *vm.Snapshot   `json:"metrics"`
	Notes     []engine.Note  `json:"notes"`
	Errors    [][2]string    `json:"errors"`
	Accounts  [3]int         `json:"accounts"`
	Metrics0  bool           `json:"metricsEnabled"`
	Defaults  config.Config  `json:"defaults"`
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	sub, _ := fs.Sub(static, "static")
	mux.Handle("GET /", http.FileServerFS(sub))
	mux.HandleFunc("GET /api/bootstrap", s.bootstrap)
	mux.HandleFunc("GET /api/events", s.events)
	mux.HandleFunc("GET /api/errors", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, s.Engine.ErrorSamples()) })
	mux.HandleFunc("GET /api/summary", s.summary)
	mux.HandleFunc("POST /api/start", s.start)
	mux.HandleFunc("POST /api/stop", func(w http.ResponseWriter, r *http.Request) {
		s.Engine.Stop("stopped from dashboard")
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/pause", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Paused bool `json:"paused"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		s.Engine.SetPaused(body.Paused, "paused from dashboard")
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/scenarios/{name}", s.updateScenario)
	mux.HandleFunc("PUT /api/config", s.putConfig)
	return noCache(mux)
}

func noCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		h.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func httpError(w http.ResponseWriter, code int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}

func (s *Server) bootstrap(w http.ResponseWriter, r *http.Request) {
	b := bootstrap{
		Status:   s.Engine.Status(),
		History:  s.Engine.History(),
		Notes:    s.Engine.Notes(),
		Errors:   s.Engine.ErrorSamples(),
		Metrics0: s.Poller != nil,
		Defaults: config.Default(),
	}
	for _, sc := range engine.Scenarios {
		b.Scenarios = append(b.Scenarios, scenarioInfo{sc.Name, sc.Title, sc.Unit})
	}
	if s.Poller != nil {
		b.Metrics = s.Poller.Last()
	}
	a, p, l := s.Engine.Accounts().Counts()
	b.Accounts = [3]int{a, p, l}
	writeJSON(w, b)
}

func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	ch := s.Hub.Subscribe()
	defer s.Hub.Unsubscribe(ch)
	keepalive := time.NewTicker(15 * time.Second)
	defer keepalive.Stop()
	_, _ = w.Write([]byte(": connected\n\n"))
	flusher.Flush()
	for {
		select {
		case <-r.Context().Done():
			return
		case msg := <-ch:
			if _, err := w.Write(msg); err != nil {
				return
			}
			flusher.Flush()
		case <-keepalive.C:
			if _, err := w.Write([]byte(": ping\n\n")); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func (s *Server) summary(w http.ResponseWriter, r *http.Request) {
	sum, ok := s.Engine.LastSummary()
	if !ok {
		httpError(w, http.StatusNotFound, errNoRun)
		return
	}
	writeJSON(w, sum)
}

type apiError string

func (e apiError) Error() string { return string(e) }

const errNoRun = apiError("no run yet")

func (s *Server) start(w http.ResponseWriter, r *http.Request) {
	if r.ContentLength > 0 {
		var cfg config.Config
		if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
			httpError(w, http.StatusBadRequest, err)
			return
		}
		if err := s.Engine.SetConfig(cfg); err != nil {
			httpError(w, http.StatusBadRequest, err)
			return
		}
	}
	if err := s.Engine.Start(); err != nil {
		httpError(w, http.StatusConflict, err)
		return
	}
	s.poke()
	writeJSON(w, s.Engine.Status())
}

func (s *Server) poke() {
	if s.Poke == nil {
		return
	}
	select {
	case s.Poke <- struct{}{}:
	default:
	}
}

func (s *Server) updateScenario(w http.ResponseWriter, r *http.Request) {
	var u engine.ScenarioUpdate
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		httpError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.Engine.UpdateScenario(r.PathValue("name"), u); err != nil {
		httpError(w, http.StatusBadRequest, err)
		return
	}
	st := s.Engine.Status()
	s.Hub.Publish("status", st)
	writeJSON(w, st)
}

func (s *Server) putConfig(w http.ResponseWriter, r *http.Request) {
	var cfg config.Config
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		httpError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.Engine.SetConfig(cfg); err != nil {
		httpError(w, http.StatusBadRequest, err)
		return
	}
	st := s.Engine.Status()
	s.Hub.Publish("status", st)
	writeJSON(w, st)
}
