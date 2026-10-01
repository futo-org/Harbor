package polycentric

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"
	"time"

	pb "code.futo.org/harbor/harbor/dev/loadtest/internal/pb/polycentric/v2"
	"google.golang.org/protobuf/proto"
)

// Vectors: seed 32×0x07 (the key the server's JWT tests use).
var testSeed = bytes.Repeat([]byte{7}, 32)

func TestIdentityDerivation(t *testing.T) {
	a := newAccountFromSeed(testSeed, nil)
	if got := hex.EncodeToString(a.pub.Key); got != "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c" {
		t.Fatalf("pubkey = %s", got)
	}
	if a.Identity() != "56556649334562c0e72507548fed923ec157b9066fa18244ad4e0782350e6f56" {
		t.Fatalf("identity = %s", a.Identity())
	}
	b := newAccountFromSeed(testSeed, []string{"http://localhost:3000"})
	if b.Identity() != "2848dad57941dc6ecf37804ca6f300aac789836311dfdbf2092f289b21f2f315" {
		t.Fatalf("identity with servers = %s", b.Identity())
	}
}

func TestGenesisEvent(t *testing.T) {
	a := newAccountFromSeed(testSeed, []string{"http://localhost:3000"})
	content := &pb.Content{ContentBody: &pb.Content_Identity{Identity: a.doc}}
	cb, _ := proto.Marshal(content)
	if d := sha256.Sum256(cb); hex.EncodeToString(d[:]) != "213924a154766a07ea4ea35e3dc9c6845711a33ca0f5827c6998070ea62162c4" {
		t.Fatalf("content digest = %x", d)
	}
	b := a.buildAt(CollIdentity, content, time.UnixMilli(1700000000000), nil)
	want := "a63587e1ba3389fa5044c26573a7b5890068b215d4bab999f166deec5639e0d591e8b0c9d24eaec3044144b0f1ab023ee955e73e29374d9d03406426e9c77b05"
	if got := hex.EncodeToString(b.SignedEvent.Signature); got != want {
		t.Fatalf("signature = %s", got)
	}
	if !ed25519.Verify(a.priv.Public().(ed25519.PublicKey), b.SignedEvent.EventBytes, b.SignedEvent.Signature) {
		t.Fatal("signature does not verify")
	}
}

func TestSequencesAndChaining(t *testing.T) {
	a := NewAccount([]string{"https://srv.example"})
	a.GenesisEvent()
	var sigs [][]byte
	for i := 1; i <= 5; i++ {
		b := a.Build(CollFeed, &pb.Content{ContentBody: &pb.Content_Post{Post: &pb.Post{Text: "hi"}}})
		var ev pb.Event
		if err := proto.Unmarshal(b.SignedEvent.EventBytes, &ev); err != nil {
			t.Fatal(err)
		}
		if ev.Key.Sequence != uint64(i) || ev.IdentitySequence != 1 || len(ev.VectorClock.Sequence) != 1 || ev.VectorClock.Sequence[0] != uint64(i) {
			t.Fatalf("event %d: seq=%d idseq=%d vc=%v", i, ev.Key.Sequence, ev.IdentitySequence, ev.VectorClock.Sequence)
		}
		if i == 1 && (len(ev.PreviousSignature) != 0 || len(ev.PreviousRoot) != 0) {
			t.Fatal("first event must not chain")
		}
		if i > 1 {
			if !bytes.Equal(ev.PreviousSignature, sigs[len(sigs)-1]) {
				t.Fatalf("event %d: previous_signature mismatch", i)
			}
			root := MerkleRoot(sigs)
			if !bytes.Equal(ev.PreviousRoot, root[:]) {
				t.Fatalf("event %d: previous_root mismatch", i)
			}
		}
		sigs = append(sigs, b.SignedEvent.Signature)
	}
	if got := a.LivePosts(); len(got) != 5 {
		t.Fatalf("live posts = %v", got)
	}
	a.Build(CollFeed, &pb.Content{ContentBody: &pb.Content_Delete{Delete: &pb.Delete{EventKey: a.EventKey(CollFeed, 2)}}})
	if got := a.LivePosts(); len(got) != 4 {
		t.Fatalf("live posts after delete = %v", got)
	}
}

func TestMerkleRoot(t *testing.T) {
	root := MerkleRoot([][]byte{{0xaa}, {0xbb}, {0xcc}})
	if hex.EncodeToString(root[:]) != "b0735f9ed75ac2b87ef88a0e62de2d7f86cdf1797f3653e797664f0b0172484a" {
		t.Fatalf("root = %x", root)
	}
}

func TestExportImport(t *testing.T) {
	a := NewAccount([]string{"https://a", "https://b"})
	a.Name = "x"
	a.GenesisEvent()
	a.Build(CollFeed, &pb.Content{ContentBody: &pb.Content_Post{Post: &pb.Post{Text: "one"}}})
	a.MarkIdentityPublished()
	raw, _ := json.Marshal(a.Export())
	var s Stored
	if err := json.Unmarshal(raw, &s); err != nil {
		t.Fatal(err)
	}
	b, err := Import(s)
	if err != nil {
		t.Fatal(err)
	}
	if b.Identity() != a.Identity() || !b.IdentityPublished() || b.Name != "x" {
		t.Fatal("round trip lost state")
	}
	x := a.Build(CollFeed, &pb.Content{ContentBody: &pb.Content_Post{Post: &pb.Post{Text: "two"}}})
	y := b.Build(CollFeed, &pb.Content{ContentBody: &pb.Content_Post{Post: &pb.Post{Text: "two"}}})
	var ex, ey pb.Event
	proto.Unmarshal(x.SignedEvent.EventBytes, &ex)
	proto.Unmarshal(y.SignedEvent.EventBytes, &ey)
	if ex.Key.Sequence != ey.Key.Sequence || !bytes.Equal(ex.PreviousRoot, ey.PreviousRoot) {
		t.Fatal("imported account diverged")
	}
}

func TestJWT(t *testing.T) {
	a := newAccountFromSeed(testSeed, nil)
	tok := MintJWT(a.priv, a.Identity(), "http://localhost:3000", time.Unix(1000, 0), time.Unix(4600, 0))
	parts := strings.Split(tok, ".")
	if len(parts) != 3 {
		t.Fatal("not a JWT")
	}
	sig, _ := base64.RawURLEncoding.DecodeString(parts[2])
	if !ed25519.Verify(a.priv.Public().(ed25519.PublicKey), []byte(parts[0]+"."+parts[1]), sig) {
		t.Fatal("bad signature")
	}
	hdr, _ := base64.RawURLEncoding.DecodeString(parts[0])
	if !strings.Contains(string(hdr), `"kid":"ea4a6c63`) || !strings.Contains(string(hdr), `"alg":"EdDSA"`) {
		t.Fatalf("header = %s", hdr)
	}
}

func TestFrontierMatchesMerkleRoot(t *testing.T) {
	var f Frontier
	var leaves [][]byte
	for n := 1; n <= 70; n++ {
		leaf := []byte{byte(n), byte(n >> 8), 0xAB}
		leaves = append(leaves, leaf)
		f.Append(leaf)
		if f.Root() != MerkleRoot(leaves) {
			t.Fatalf("n=%d: frontier root differs from full recomputation", n)
		}
		if f.Len() != uint64(n) {
			t.Fatalf("n=%d: len=%d", n, f.Len())
		}
	}
	if len(f.Hashes) > 7 {
		t.Fatalf("frontier should be O(log n), has %d nodes", len(f.Hashes))
	}
}
