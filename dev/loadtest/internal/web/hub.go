package web

import (
	"encoding/json"
	"sync"
)

// Hub fans server-sent events out to connected dashboards. Slow clients
// drop messages rather than stalling the engine.
type Hub struct {
	mu   sync.Mutex
	subs map[chan []byte]struct{}
}

func NewHub() *Hub { return &Hub{subs: map[chan []byte]struct{}{}} }

func (h *Hub) Subscribe() chan []byte {
	ch := make(chan []byte, 64)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *Hub) Unsubscribe(ch chan []byte) {
	h.mu.Lock()
	delete(h.subs, ch)
	h.mu.Unlock()
}

// Publish encodes v once and sends it as an SSE message of the given event
// type to every subscriber.
func (h *Hub) Publish(event string, v any) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	msg := make([]byte, 0, len(data)+len(event)+16)
	msg = append(msg, "event: "...)
	msg = append(msg, event...)
	msg = append(msg, "\ndata: "...)
	msg = append(msg, data...)
	msg = append(msg, "\n\n"...)
	h.mu.Lock()
	for ch := range h.subs {
		select {
		case ch <- msg:
		default:
		}
	}
	h.mu.Unlock()
}
