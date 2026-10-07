package harbor

import (
	"reflect"
	"testing"
)

func TestLabels(t *testing.T) {
	got := Labels([]string{"https://srv.staging.harbor.social", "https://srv.staging.polycentric.io"})
	if !reflect.DeepEqual(got, []string{"harbor.social", "polycentric.io"}) {
		t.Fatalf("got %v", got)
	}
	got = Labels([]string{"http://127.0.0.1:9101", "http://127.0.0.1:9102", "http://localhost:3000"})
	if !reflect.DeepEqual(got, []string{"127.0.0.1:9101", "127.0.0.1:9102", "localhost:3000"}) {
		t.Fatalf("got %v", got)
	}
	got = Labels([]string{"https://a.example.com", "https://b.example.com"})
	if !reflect.DeepEqual(got, []string{"a.example.com", "b.example.com"}) {
		t.Fatalf("got %v", got)
	}
}
