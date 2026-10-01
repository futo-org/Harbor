// Package harbor wraps the Harbor/Polycentric RPCs used by the scenarios,
// recording every call into the stats recorder under "<RPC>@<server>".
package harbor

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"strings"
	"time"

	"code.futo.org/harbor/harbor/dev/loadtest/internal/grpcweb"
	pb "code.futo.org/harbor/harbor/dev/loadtest/internal/pb/polycentric/v2"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/polycentric"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/stats"
	"google.golang.org/protobuf/proto"
)

// Server is one Polycentric server (a seed server in the app's config).
type Server struct {
	URL   string
	Label string // short name used in stats keys
	RPC   *grpcweb.Client
	Rec   *stats.Recorder
	// CDN is the blob base URL reported by GetInfo (defaults to URL).
	CDN string
}

// ShortLabel derives a stats label from a server URL:
// https://srv.staging.harbor.social -> harbor.social. IP addresses and
// localhost keep host:port.
func ShortLabel(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return raw
	}
	host := u.Hostname()
	if net.ParseIP(host) != nil || !strings.Contains(host, ".") {
		return u.Host
	}
	parts := strings.Split(host, ".")
	return strings.Join(parts[len(parts)-2:], ".")
}

// Labels returns a distinct stats label per server URL, falling back to the
// full host when short labels would collide.
func Labels(urls []string) []string {
	out := make([]string, len(urls))
	seen := map[string]int{}
	for i, u := range urls {
		out[i] = ShortLabel(u)
		seen[out[i]]++
	}
	for i, u := range urls {
		if seen[out[i]] > 1 {
			if p, err := url.Parse(u); err == nil && p.Host != "" {
				out[i] = p.Host
			} else {
				out[i] = u
			}
		}
	}
	return out
}

func (s *Server) key(rpc string) string { return rpc + "@" + s.Label }

// AllPrefix keys the per-server aggregate of every call ("ALL@<label>"),
// which gives whole-server latency percentiles.
const AllPrefix = "ALL@"

func (s *Server) record(op string, res grpcweb.Result, class string, err error) {
	s.Rec.Record(s.key(op), res.Duration, res.ReqBytes, res.RespBytes, class)
	s.Rec.Record(AllPrefix+s.Label, res.Duration, res.ReqBytes, res.RespBytes, class)
	if err != nil {
		s.Rec.NoteError(s.key(op), class, err.Error())
	}
}

// Call performs one RPC, records it, and returns the error (nil on success).
// A non-nil caller attaches that account's bearer JWT, as the logged-in app
// does on every request (server-side it costs an identity lookup, and only
// changes block filtering on reads).
func (s *Server) Call(ctx context.Context, service, rpc string, req, resp proto.Message, caller *polycentric.Account) error {
	token := ""
	if caller != nil {
		token = caller.AuthToken(s.URL)
	}
	res, err := s.RPC.Call(ctx, "polycentric.v2."+service+"/"+rpc, req, resp, token)
	class := grpcweb.ErrorClass(err)
	if class == "canceled" {
		return err
	}
	s.record(rpc, res, class, err)
	return err
}

// Get fetches a plain URL (blob, image proxy) and records it under name.
func (s *Server) Get(ctx context.Context, name, rawURL string) error {
	res, err := s.RPC.Get(ctx, rawURL)
	class := grpcweb.ErrorClass(err)
	if class == "canceled" {
		return err
	}
	s.record(name, res, class, err)
	return err
}

// PutEventsError reports events the server skipped inside a successful RPC.
type PutEventsError struct {
	Errors []*pb.PutEventError
}

func (e *PutEventsError) Error() string {
	if len(e.Errors) == 0 {
		return "put events failed"
	}
	return fmt.Sprintf("%d event(s) rejected: [%d] %s", len(e.Errors), e.Errors[0].EventBundleIndex, e.Errors[0].Message)
}

func (e *PutEventsError) ErrorClass() string {
	if len(e.Errors) == 0 {
		return "rejected"
	}
	return "rejected:" + rejectionClass(e.Errors[0].Message)
}

// PutEvents uploads bundles. Per-event rejections (which the RPC reports
// with an OK status) are recorded as a separate "PutEvents.rejected" error
// class and returned as *PutEventsError.
func (s *Server) PutEvents(ctx context.Context, bundles []*pb.EventBundle, caller *polycentric.Account) (*pb.PutEventsResponse, error) {
	token := ""
	if caller != nil {
		token = caller.AuthToken(s.URL)
	}
	var resp pb.PutEventsResponse
	res, err := s.RPC.Call(ctx, "polycentric.v2.EventSyncService/PutEvents", &pb.PutEventsRequest{EventBundles: bundles}, &resp, token)
	class := grpcweb.ErrorClass(err)
	if class == "canceled" {
		return nil, err
	}
	if err == nil && len(resp.Errors) > 0 {
		pe := &PutEventsError{Errors: resp.Errors}
		err, class = pe, pe.ErrorClass()
	}
	s.record("PutEvents", res, class, err)
	if err != nil {
		return &resp, err
	}
	return &resp, nil
}

// rejectionClass reduces "<code description>: <msg>" to a short class.
func rejectionClass(msg string) string {
	desc, _, _ := strings.Cut(msg, ":")
	desc = strings.ToLower(strings.TrimSpace(desc))
	switch {
	case strings.Contains(desc, "permission"):
		return "PERMISSION_DENIED"
	case strings.Contains(desc, "precondition") || strings.Contains(desc, "state"):
		return "FAILED_PRECONDITION"
	case strings.Contains(desc, "invalid") || strings.Contains(desc, "argument"):
		return "INVALID_ARGUMENT"
	case strings.Contains(desc, "authenticat") || strings.Contains(desc, "credentials"):
		return "UNAUTHENTICATED"
	case strings.Contains(desc, "internal"):
		return "INTERNAL"
	case strings.Contains(desc, "unavailable"):
		return "UNAVAILABLE"
	}
	return "OTHER"
}

// UploadBlob uploads one blob body.
func (s *Server) UploadBlob(ctx context.Context, blob *pb.Blob, body []byte, caller *polycentric.Account) error {
	return s.Call(ctx, "ContentService", "UploadBlob", &pb.UploadBlobRequest{Blob: blob, Body: body}, &pb.UploadBlobResponse{}, caller)
}

// Preflight sends a browser CORS preflight for service/rpc, recorded under
// one aggregate "OPTIONS" operation.
func (s *Server) Preflight(ctx context.Context, service, rpc string, withAuth bool) error {
	res, err := s.RPC.Preflight(ctx, "polycentric.v2."+service+"/"+rpc, withAuth)
	class := grpcweb.ErrorClass(err)
	if class == "canceled" {
		return err
	}
	s.record("OPTIONS", res, class, err)
	return err
}

// BlobURL is where the app fetches a blob body from.
func (s *Server) BlobURL(d *pb.ContentDigest) string {
	base := s.CDN
	if base == "" {
		base = s.URL
	}
	return fmt.Sprintf("%s/blob/%d_%x", strings.TrimRight(base, "/"), int32(d.GetType()), d.GetValue())
}

// Timed runs fn and records its wall time as a synthetic operation (e.g. a
// whole session or a publish across servers).
func Timed(rec *stats.Recorder, name string, fn func() error) error {
	start := time.Now()
	err := fn()
	class := grpcweb.ErrorClass(err)
	if class == "canceled" {
		return err
	}
	rec.Record(name, time.Since(start), 0, 0, class)
	return err
}

// RecordGet fetches rawURL with c and records it under name.
func RecordGet(ctx context.Context, rec *stats.Recorder, c *grpcweb.Client, name, rawURL string) error {
	res, err := c.Get(ctx, rawURL)
	class := grpcweb.ErrorClass(err)
	if class == "canceled" {
		return err
	}
	rec.Record(name, res.Duration, res.ReqBytes, res.RespBytes, class)
	if err != nil {
		rec.NoteError(name, class, err.Error())
	}
	return err
}
