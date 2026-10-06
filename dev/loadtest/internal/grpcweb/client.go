// Package grpcweb is a minimal gRPC-Web (binary, application/grpc-web+proto)
// client, speaking the same wire format as the Harbor web app so load hits the
// same server code paths (tonic-web behind Cloudflare/Envoy).
package grpcweb

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/textproto"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"google.golang.org/protobuf/proto"
)

// Code is a gRPC status code.
type Code int

const (
	OK                 Code = 0
	Canceled           Code = 1
	Unknown            Code = 2
	InvalidArgument    Code = 3
	DeadlineExceeded   Code = 4
	NotFound           Code = 5
	AlreadyExists      Code = 6
	PermissionDenied   Code = 7
	ResourceExhausted  Code = 8
	FailedPrecondition Code = 9
	Aborted            Code = 10
	OutOfRange         Code = 11
	Unimplemented      Code = 12
	Internal           Code = 13
	Unavailable        Code = 14
	DataLoss           Code = 15
	Unauthenticated    Code = 16
)

var codeNames = [...]string{
	"OK", "CANCELED", "UNKNOWN", "INVALID_ARGUMENT", "DEADLINE_EXCEEDED",
	"NOT_FOUND", "ALREADY_EXISTS", "PERMISSION_DENIED", "RESOURCE_EXHAUSTED",
	"FAILED_PRECONDITION", "ABORTED", "OUT_OF_RANGE", "UNIMPLEMENTED",
	"INTERNAL", "UNAVAILABLE", "DATA_LOSS", "UNAUTHENTICATED",
}

func (c Code) String() string {
	if c >= 0 && int(c) < len(codeNames) {
		return codeNames[c]
	}
	return "CODE_" + strconv.Itoa(int(c))
}

// Error describes a failed call. Class is a short, low-cardinality label
// suitable for grouping in stats ("grpc:INTERNAL", "http:429", "timeout", ...).
type Error struct {
	Class      string
	HTTPStatus int
	Code       Code
	Message    string
	Err        error
}

func (e *Error) Error() string {
	var b strings.Builder
	b.WriteString(e.Class)
	if e.Message != "" {
		b.WriteString(": ")
		b.WriteString(e.Message)
	}
	if e.Err != nil {
		b.WriteString(": ")
		b.WriteString(e.Err.Error())
	}
	return b.String()
}

func (e *Error) Unwrap() error { return e.Err }

// ErrorClass returns the stats class for err, or "" for nil.
func ErrorClass(err error) string {
	if err == nil {
		return ""
	}
	var ge *Error
	if errors.As(err, &ge) {
		return ge.Class
	}
	var c interface{ ErrorClass() string }
	if errors.As(err, &c) {
		return c.ErrorClass()
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "timeout"
	}
	if errors.Is(err, context.Canceled) {
		return "canceled"
	}
	return "error"
}

// CodeOf returns the gRPC code carried by err, Unknown for other errors.
func CodeOf(err error) Code {
	if err == nil {
		return OK
	}
	var ge *Error
	if errors.As(err, &ge) && ge.HTTPStatus == 200 {
		return ge.Code
	}
	return Unknown
}

// Result carries per-call measurements, filled in whether or not the call
// succeeded.
type Result struct {
	Duration  time.Duration
	ReqBytes  int
	RespBytes int
}

// Client issues gRPC-Web calls against one server.
type Client struct {
	BaseURL string
	// Pool holds independent HTTP clients (each with its own connections);
	// requests are spread across them round-robin.
	Pool      []*http.Client
	UserAgent string
	// Headers are added to every request (e.g. Origin to mimic the web app).
	Headers http.Header

	next atomic.Uint64
}

func (c *Client) http() *http.Client {
	if len(c.Pool) == 1 {
		return c.Pool[0]
	}
	return c.Pool[c.next.Add(1)%uint64(len(c.Pool))]
}

// Call invokes method (e.g. "polycentric.v2.FeedsService/GetExploreFeed")
// and decodes the response into resp. authToken, when non-empty, is sent as
// a bearer token.
func (c *Client) Call(ctx context.Context, method string, req, resp proto.Message, authToken string) (Result, error) {
	var res Result
	body, err := proto.Marshal(req)
	if err != nil {
		return res, &Error{Class: "marshal", Err: err}
	}
	frame := make([]byte, 5+len(body))
	binary.BigEndian.PutUint32(frame[1:5], uint32(len(body)))
	copy(frame[5:], body)
	res.ReqBytes = len(frame)

	hr, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/"+method, bytes.NewReader(frame))
	if err != nil {
		return res, &Error{Class: "request", Err: err}
	}
	for k, vs := range c.Headers {
		hr.Header[k] = vs
	}
	hr.Header.Set("Content-Type", "application/grpc-web+proto")
	hr.Header.Set("Accept", "application/grpc-web+proto")
	hr.Header.Set("X-Grpc-Web", "1")
	if c.UserAgent != "" {
		hr.Header.Set("User-Agent", c.UserAgent)
	}
	if authToken != "" {
		hr.Header.Set("Authorization", "Bearer "+authToken)
	}

	start := time.Now()
	hresp, err := c.http().Do(hr)
	if err != nil {
		res.Duration = time.Since(start)
		return res, transportError(ctx, err)
	}
	data, err := io.ReadAll(hresp.Body)
	hresp.Body.Close()
	res.Duration = time.Since(start)
	res.RespBytes = len(data)
	if err != nil {
		return res, transportError(ctx, err)
	}

	if hresp.StatusCode != http.StatusOK {
		msg := strings.TrimSpace(string(data))
		if len(msg) > 200 {
			msg = msg[:200]
		}
		return res, &Error{Class: "http:" + strconv.Itoa(hresp.StatusCode), HTTPStatus: hresp.StatusCode, Message: msg}
	}

	// Trailers-only responses carry the status in the HTTP headers.
	status, message, haveStatus := statusFrom(hresp.Header)
	var payload []byte
	gotPayload := false
	for len(data) > 0 {
		if len(data) < 5 {
			return res, &Error{Class: "decode", HTTPStatus: 200, Message: "truncated frame header"}
		}
		flag := data[0]
		n := int(binary.BigEndian.Uint32(data[1:5]))
		if len(data) < 5+n {
			return res, &Error{Class: "decode", HTTPStatus: 200, Message: "truncated frame"}
		}
		chunk := data[5 : 5+n]
		data = data[5+n:]
		if flag&0x80 != 0 {
			if s, m, ok := parseTrailers(chunk); ok {
				status, message, haveStatus = s, m, true
			}
			continue
		}
		if !gotPayload {
			payload, gotPayload = chunk, true
		}
	}
	if !haveStatus {
		return res, &Error{Class: "grpc:MISSING_STATUS", HTTPStatus: 200, Code: Unknown}
	}
	if status != OK {
		return res, &Error{Class: "grpc:" + status.String(), HTTPStatus: 200, Code: status, Message: message}
	}
	if resp != nil && gotPayload {
		if err := proto.Unmarshal(payload, resp); err != nil {
			return res, &Error{Class: "decode", HTTPStatus: 200, Err: err}
		}
	}
	return res, nil
}

func transportError(ctx context.Context, err error) error {
	if ctx.Err() == context.Canceled {
		return &Error{Class: "canceled", Err: err}
	}
	if ctx.Err() == context.DeadlineExceeded || isTimeout(err) {
		return &Error{Class: "timeout", Err: err}
	}
	var ue *url.Error
	if errors.As(err, &ue) {
		err = ue.Err
	}
	return &Error{Class: "transport", Err: err}
}

func isTimeout(err error) bool {
	var t interface{ Timeout() bool }
	return errors.As(err, &t) && t.Timeout()
}

func statusFrom(h http.Header) (Code, string, bool) {
	s := h.Get("Grpc-Status")
	if s == "" {
		return 0, "", false
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return Unknown, s, true
	}
	msg, _ := url.PathUnescape(h.Get("Grpc-Message"))
	return Code(n), msg, true
}

func parseTrailers(b []byte) (Code, string, bool) {
	h := http.Header{}
	for _, line := range strings.Split(string(b), "\r\n") {
		k, v, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		h.Add(textproto.CanonicalMIMEHeaderKey(strings.TrimSpace(k)), strings.TrimSpace(v))
	}
	return statusFrom(h)
}

// Get performs a plain HTTP GET (blobs, image proxy, web HTML), discarding
// the body but counting its size.
func (c *Client) Get(ctx context.Context, rawURL string) (Result, error) {
	var res Result
	hr, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return res, &Error{Class: "request", Err: err}
	}
	for k, vs := range c.Headers {
		hr.Header[k] = vs
	}
	if c.UserAgent != "" {
		hr.Header.Set("User-Agent", c.UserAgent)
	}
	start := time.Now()
	hresp, err := c.http().Do(hr)
	if err != nil {
		res.Duration = time.Since(start)
		return res, transportError(ctx, err)
	}
	n, err := io.Copy(io.Discard, hresp.Body)
	hresp.Body.Close()
	res.Duration = time.Since(start)
	res.RespBytes = int(n)
	if err != nil {
		return res, transportError(ctx, err)
	}
	if hresp.StatusCode >= 400 {
		return res, &Error{Class: "http:" + strconv.Itoa(hresp.StatusCode), HTTPStatus: hresp.StatusCode, Message: fmt.Sprintf("GET %s", hr.URL.Path)}
	}
	return res, nil
}

// Preflight sends the CORS preflight a browser issues before its first
// cross-origin gRPC-Web POST to a method.
func (c *Client) Preflight(ctx context.Context, method string, withAuth bool) (Result, error) {
	var res Result
	hr, err := http.NewRequestWithContext(ctx, http.MethodOptions, c.BaseURL+"/"+method, nil)
	if err != nil {
		return res, &Error{Class: "request", Err: err}
	}
	for k, vs := range c.Headers {
		hr.Header[k] = vs
	}
	if c.UserAgent != "" {
		hr.Header.Set("User-Agent", c.UserAgent)
	}
	hr.Header.Set("Access-Control-Request-Method", "POST")
	reqHeaders := "content-type,x-grpc-web"
	if withAuth {
		reqHeaders = "authorization," + reqHeaders
	}
	hr.Header.Set("Access-Control-Request-Headers", reqHeaders)
	start := time.Now()
	hresp, err := c.http().Do(hr)
	if err != nil {
		res.Duration = time.Since(start)
		return res, transportError(ctx, err)
	}
	n, _ := io.Copy(io.Discard, hresp.Body)
	hresp.Body.Close()
	res.Duration = time.Since(start)
	res.RespBytes = int(n)
	if hresp.StatusCode >= 400 {
		return res, &Error{Class: "http:" + strconv.Itoa(hresp.StatusCode), HTTPStatus: hresp.StatusCode}
	}
	return res, nil
}

// Fetch GETs rawURL and returns its body (up to 8 MiB).
func (c *Client) Fetch(ctx context.Context, rawURL string) ([]byte, error) {
	hr, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	if c.UserAgent != "" {
		hr.Header.Set("User-Agent", c.UserAgent)
	}
	hresp, err := c.http().Do(hr)
	if err != nil {
		return nil, err
	}
	defer hresp.Body.Close()
	if hresp.StatusCode >= 400 {
		return nil, fmt.Errorf("GET %s: HTTP %d", rawURL, hresp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(hresp.Body, 8<<20))
}
