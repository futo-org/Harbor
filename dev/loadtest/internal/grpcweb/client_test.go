package grpcweb

import (
	"context"
	"encoding/binary"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	pb "code.futo.org/harbor/harbor/dev/loadtest/internal/pb/polycentric/v2"
	"google.golang.org/protobuf/proto"
)

func frame(flag byte, b []byte) []byte {
	out := make([]byte, 5+len(b))
	out[0] = flag
	binary.BigEndian.PutUint32(out[1:5], uint32(len(b)))
	copy(out[5:], b)
	return out
}

func TestCallRoundTrip(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Content-Type") != "application/grpc-web+proto" || r.URL.Path != "/polycentric.v2.EventSyncService/ListHeads" {
			http.Error(w, "bad request", 400)
			return
		}
		body, _ := io.ReadAll(r.Body)
		var req pb.ListHeadsRequest
		if err := proto.Unmarshal(body[5:], &req); err != nil || req.Identity != "abc" {
			http.Error(w, "bad body", 400)
			return
		}
		resp, _ := proto.Marshal(&pb.ListHeadsResponse{Heads: []*pb.EventKey{{Identity: "abc", Sequence: 3}}})
		w.Header().Set("Content-Type", "application/grpc-web+proto")
		w.Write(frame(0, resp))
		w.Write(frame(0x80, []byte("grpc-status:0\r\n")))
	}))
	defer srv.Close()
	c := &Client{BaseURL: srv.URL, Pool: []*http.Client{srv.Client()}}
	var resp pb.ListHeadsResponse
	res, err := c.Call(context.Background(), "polycentric.v2.EventSyncService/ListHeads", &pb.ListHeadsRequest{Identity: "abc"}, &resp, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(resp.Heads) != 1 || resp.Heads[0].Sequence != 3 || res.RespBytes == 0 {
		t.Fatalf("resp = %v res = %+v", &resp, res)
	}
}

func TestCallErrors(t *testing.T) {
	cases := []struct {
		name    string
		handler http.HandlerFunc
		class   string
	}{
		{"trailer status", func(w http.ResponseWriter, r *http.Request) {
			w.Write(frame(0x80, []byte("grpc-status:13\r\ngrpc-message:boom%20here\r\n")))
		}, "grpc:INTERNAL"},
		{"trailers-only headers", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Grpc-Status", "16")
			w.Header().Set("Grpc-Message", "bad token")
		}, "grpc:UNAUTHENTICATED"},
		{"edge block", func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "error code: 1020", http.StatusForbidden)
		}, "http:403"},
		{"missing status", func(w http.ResponseWriter, r *http.Request) {
			w.Write(frame(0, nil))
		}, "grpc:MISSING_STATUS"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(tc.handler)
			defer srv.Close()
			c := &Client{BaseURL: srv.URL, Pool: []*http.Client{srv.Client()}}
			_, err := c.Call(context.Background(), "x/Y", &pb.ListHeadsRequest{}, &pb.ListHeadsResponse{}, "")
			if got := ErrorClass(err); got != tc.class {
				t.Fatalf("class = %q (%v), want %q", got, err, tc.class)
			}
		})
	}
}
