// Package polycentric builds and signs Polycentric v2 events the same way the
// Harbor client does, so load-test content is accepted by the server and also
// passes the client's own read-side validation (identity_sequence and vector
// clock checks), i.e. it renders in the real app.
package polycentric

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"slices"
	"sync"
	"time"

	pb "code.futo.org/harbor/harbor/dev/loadtest/internal/pb/polycentric/v2"
	"google.golang.org/protobuf/proto"
)

// Collections (packages/rs-common/src/models/collections.rs).
const (
	CollIdentity      int32 = 1
	CollFeed          int32 = 2 // posts, reposts, and every Delete
	CollProfile       int32 = 3
	CollInteractions  int32 = 4 // reactions
	CollSocialGraph   int32 = 5 // follows, blocks
	CollReports       int32 = 6
	CollLabels        int32 = 7
	CollVerifications int32 = 8
)

// Application tags every event the load tester signs so its content can be
// told apart from real Harbor clients.
var Application = &pb.Application{
	Name:    "harbor-loadtest",
	Id:      "org.futo.harbor.loadtest",
	Version: "0.1.0",
	Url:     "https://code.futo.org/harbor/harbor",
}

// chain is what is needed to link the next event in a collection.
type chain struct {
	last     []byte
	frontier Frontier
}

// Account is a single-key Polycentric identity. Methods are safe for
// concurrent use; in practice the account pool leases each account to one
// iteration at a time, like one human using one device.
type Account struct {
	mu sync.Mutex

	priv     ed25519.PrivateKey
	pub      *pb.PublicKey
	identity string
	doc      *pb.Identity

	Name      string
	CreatedAt time.Time

	nextSeq map[int32]uint64
	chains  map[int32]*chain // per collection: last signature + Merkle frontier
	posts   []uint64         // FEED sequences holding posts/reposts (for cleanup)
	deleted map[uint64]bool

	identityPublished bool
}

// NewAccount generates a fresh key and identity document listing servers.
func NewAccount(servers []string) *Account {
	seed := make([]byte, ed25519.SeedSize)
	if _, err := rand.Read(seed); err != nil {
		panic(err)
	}
	return newAccountFromSeed(seed, servers)
}

func newAccountFromSeed(seed []byte, servers []string) *Account {
	priv := ed25519.NewKeyFromSeed(seed)
	pub := &pb.PublicKey{KeyType: pb.KeyType_KEY_TYPE_ED25519, Key: []byte(priv.Public().(ed25519.PublicKey))}
	doc := &pb.Identity{RotationKeys: []*pb.PublicKey{pub}}
	if servers != nil {
		doc.Servers = &pb.ServerList{Urls: servers}
	}
	return &Account{
		priv:      priv,
		pub:       pub,
		identity:  IdentityOf(doc),
		doc:       doc,
		CreatedAt: time.Now(),
		nextSeq:   map[int32]uint64{},
		chains:    map[int32]*chain{},
		deleted:   map[uint64]bool{},
	}
}

// IdentityOf derives the identity string: lowercase hex SHA-256 of the
// genesis Identity message's canonical encoding.
func IdentityOf(doc *pb.Identity) string {
	b, err := proto.MarshalOptions{Deterministic: true}.Marshal(doc)
	if err != nil {
		panic(err)
	}
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func (a *Account) Identity() string         { return a.identity }
func (a *Account) PublicKey() *pb.PublicKey { return a.pub }
func (a *Account) PrivateKey() ed25519.PrivateKey {
	return a.priv
}

// IdentityPublished reports whether the genesis event has been accepted.
func (a *Account) IdentityPublished() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.identityPublished
}

func (a *Account) MarkIdentityPublished() {
	a.mu.Lock()
	a.identityPublished = true
	a.mu.Unlock()
}

// GenesisEvent builds the identity event (collection 1, sequence 1).
func (a *Account) GenesisEvent() *pb.EventBundle {
	return a.Build(CollIdentity, &pb.Content{ContentBody: &pb.Content_Identity{Identity: a.doc}})
}

// Build signs content into the next event of coll. Sequences, the vector
// clock, identity_sequence, previous_signature and the RFC 6962 previous_root
// are all maintained as the Harbor client does for a single-key identity.
func (a *Account) Build(coll int32, content *pb.Content) *pb.EventBundle {
	return a.buildAt(coll, content, time.Now(), Application)
}

func (a *Account) buildAt(coll int32, content *pb.Content, at time.Time, app *pb.Application) *pb.EventBundle {
	cb, err := proto.Marshal(content)
	if err != nil {
		panic(err)
	}
	digest := sha256.Sum256(cb)

	a.mu.Lock()
	defer a.mu.Unlock()

	seq := max(a.nextSeq[coll], 1)
	identitySeq := uint64(1)
	if coll == CollIdentity {
		identitySeq = seq
	}
	ev := &pb.Event{
		Key: &pb.EventKey{
			Collection: coll,
			Identity:   a.identity,
			SignedBy:   a.pub,
			Sequence:   seq,
		},
		IdentitySequence: identitySeq,
		VectorClock:      &pb.VectorClock{Sequence: []uint64{seq}},
		ContentDigest: &pb.ContentDigest{
			Type:  pb.ContentDigestType_CONTENT_DIGEST_TYPE_SHA256,
			Value: digest[:],
		},
		CreatedAt:   uint64(at.UnixMilli()),
		Application: app,
	}
	ch := a.chains[coll]
	if ch == nil {
		ch = &chain{}
		a.chains[coll] = ch
	}
	if ch.last != nil {
		ev.PreviousSignature = ch.last
		root := ch.frontier.Root()
		ev.PreviousRoot = root[:]
	}
	eb, err := proto.Marshal(ev)
	if err != nil {
		panic(err)
	}
	sig := ed25519.Sign(a.priv, eb)
	ch.last = sig
	ch.frontier.Append(sig)
	a.nextSeq[coll] = seq + 1
	if coll == CollFeed {
		switch content.ContentBody.(type) {
		case *pb.Content_Post, *pb.Content_Repost:
			a.posts = append(a.posts, seq)
		case *pb.Content_Delete:
			if t := content.GetDelete().GetEventKey(); t.GetIdentity() == a.identity {
				a.deleted[t.GetSequence()] = true
			}
		}
	}
	return &pb.EventBundle{
		SignedEvent:       &pb.SignedEvent{Signature: sig, EventBytes: eb},
		SerializedContent: &pb.SerializedContent{ContentBytes: cb},
	}
}

// EventKey returns the key of this account's event in coll at seq.
func (a *Account) EventKey(coll int32, seq uint64) *pb.EventKey {
	return &pb.EventKey{Collection: coll, Identity: a.identity, SignedBy: a.pub, Sequence: seq}
}

// KeyOf extracts the EventKey from a bundle.
func KeyOf(b *pb.EventBundle) (*pb.EventKey, error) {
	var ev pb.Event
	if err := proto.Unmarshal(b.GetSignedEvent().GetEventBytes(), &ev); err != nil {
		return nil, err
	}
	if ev.Key == nil {
		return nil, fmt.Errorf("event without key")
	}
	return ev.Key, nil
}

// LivePosts returns FEED sequences of posts/reposts not yet deleted.
func (a *Account) LivePosts() []uint64 {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := make([]uint64, 0, len(a.posts))
	for _, s := range a.posts {
		if !a.deleted[s] {
			out = append(out, s)
		}
	}
	return out
}

// PostCount is the number of posts/reposts this account has signed.
func (a *Account) PostCount() int {
	a.mu.Lock()
	defer a.mu.Unlock()
	return len(a.posts)
}

// Heads returns one EventKey per collection this account has written, at
// its latest sequence: what the app sends as ListEvents heads when syncing.
func (a *Account) Heads() []*pb.EventKey {
	a.mu.Lock()
	defer a.mu.Unlock()
	colls := make([]int32, 0, len(a.nextSeq))
	for c, next := range a.nextSeq {
		if next > 1 {
			colls = append(colls, c)
		}
	}
	slices.Sort(colls)
	heads := make([]*pb.EventKey, 0, len(colls))
	for _, c := range colls {
		heads = append(heads, &pb.EventKey{Collection: c, Identity: a.identity, SignedBy: a.pub, Sequence: a.nextSeq[c] - 1})
	}
	return heads
}

// StoredChain is a collection's link state: the last signature and the
// Merkle frontier (subtree sizes and hashes) over all signatures so far.
type StoredChain struct {
	Last   string   `json:"last"`
	Sizes  []uint64 `json:"sizes"`
	Hashes []string `json:"hashes"`
}

// Stored is the on-disk form of an account (JSON lines in the accounts file).
type Stored struct {
	Seed      string                `json:"seed"`
	Identity  string                `json:"identity"`
	Name      string                `json:"name"`
	Servers   []string              `json:"servers,omitempty"`
	CreatedAt time.Time             `json:"createdAt"`
	NextSeq   map[int32]uint64      `json:"nextSeq"`
	Chains    map[int32]StoredChain `json:"chains"`
	// LegacySigs is the pre-frontier format (every signature); read only.
	LegacySigs map[int32][]string `json:"sigs,omitempty"`
	Posts      []uint64           `json:"posts,omitempty"`
	Deleted    []uint64           `json:"deleted,omitempty"`
	Published  bool               `json:"published"`
}

func (a *Account) Export() Stored {
	a.mu.Lock()
	defer a.mu.Unlock()
	s := Stored{
		Seed:      hex.EncodeToString(a.priv.Seed()),
		Identity:  a.identity,
		Name:      a.Name,
		CreatedAt: a.CreatedAt,
		NextSeq:   map[int32]uint64{},
		Chains:    map[int32]StoredChain{},
		Posts:     slices.Clone(a.posts),
		Published: a.identityPublished,
	}
	if a.doc.Servers != nil {
		s.Servers = slices.Clone(a.doc.Servers.Urls)
	}
	for k, v := range a.nextSeq {
		s.NextSeq[k] = v
	}
	for k, ch := range a.chains {
		sc := StoredChain{Last: hex.EncodeToString(ch.last), Sizes: slices.Clone(ch.frontier.Sizes)}
		for _, h := range ch.frontier.Hashes {
			sc.Hashes = append(sc.Hashes, hex.EncodeToString(h[:]))
		}
		s.Chains[k] = sc
	}
	for k := range a.deleted {
		s.Deleted = append(s.Deleted, k)
	}
	slices.Sort(s.Deleted)
	return s
}

func Import(s Stored) (*Account, error) {
	seed, err := hex.DecodeString(s.Seed)
	if err != nil || len(seed) != ed25519.SeedSize {
		return nil, fmt.Errorf("bad seed for %s", s.Identity)
	}
	var servers []string
	if s.Servers != nil {
		servers = s.Servers
	}
	a := newAccountFromSeed(seed, servers)
	if a.identity != s.Identity {
		// Older identity documents without a server list hash differently.
		if b := newAccountFromSeed(seed, nil); b.identity == s.Identity {
			a = b
		} else {
			return nil, fmt.Errorf("identity mismatch for %s", s.Identity)
		}
	}
	a.Name = s.Name
	a.CreatedAt = s.CreatedAt
	a.identityPublished = s.Published
	for k, v := range s.NextSeq {
		a.nextSeq[k] = v
	}
	for k, sigs := range s.LegacySigs {
		ch := &chain{}
		for _, h := range sigs {
			sig, err := hex.DecodeString(h)
			if err != nil {
				return nil, fmt.Errorf("bad signature for %s", s.Identity)
			}
			ch.last = sig
			ch.frontier.Append(sig)
		}
		a.chains[k] = ch
	}
	for k, sc := range s.Chains {
		last, err := hex.DecodeString(sc.Last)
		if err != nil || len(sc.Sizes) != len(sc.Hashes) {
			return nil, fmt.Errorf("bad chain state for %s", s.Identity)
		}
		ch := &chain{last: last, frontier: Frontier{Sizes: slices.Clone(sc.Sizes)}}
		for _, h := range sc.Hashes {
			b, err := hex.DecodeString(h)
			if err != nil || len(b) != 32 {
				return nil, fmt.Errorf("bad chain state for %s", s.Identity)
			}
			ch.frontier.Hashes = append(ch.frontier.Hashes, [32]byte(b))
		}
		a.chains[k] = ch
	}
	a.posts = slices.Clone(s.Posts)
	for _, d := range s.Deleted {
		a.deleted[d] = true
	}
	return a, nil
}
