// Package world holds state shared by scenarios: the accounts the test
// controls and the posts they can interact with.
package world

import (
	"bufio"
	"encoding/json"
	"errors"
	"math"
	"math/rand/v2"
	"os"
	"path/filepath"
	"sync"

	pb "code.futo.org/harbor/harbor/dev/loadtest/internal/pb/polycentric/v2"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/polycentric"
)

// ErrNoAccount means every published account is currently leased (or none
// exist yet); the iteration is skipped and counted as failed.
var ErrNoAccount = errors.New("no idle account")

// Accounts is the pool of identities this tool created.
type Accounts struct {
	mu        sync.Mutex
	all       []*polycentric.Account
	byID      map[string]*polycentric.Account
	published []*polycentric.Account
	leased    map[*polycentric.Account]bool
}

func NewAccounts() *Accounts {
	return &Accounts{byID: map[string]*polycentric.Account{}, leased: map[*polycentric.Account]bool{}}
}

// Add registers an account; it becomes leasable once its identity is
// published.
func (p *Accounts) Add(a *polycentric.Account) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if _, ok := p.byID[a.Identity()]; ok {
		return
	}
	p.all = append(p.all, a)
	p.byID[a.Identity()] = a
	if a.IdentityPublished() {
		p.published = append(p.published, a)
	}
}

// Published marks a previously added account as usable by other scenarios.
func (p *Accounts) Published(a *polycentric.Account) {
	a.MarkIdentityPublished()
	p.mu.Lock()
	p.published = append(p.published, a)
	p.mu.Unlock()
}

// Lease hands out an idle published account exclusively; call release when
// done.
func (p *Accounts) Lease(r *rand.Rand) (*polycentric.Account, func(), error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	n := len(p.published)
	if n == 0 {
		return nil, nil, ErrNoAccount
	}
	start := r.IntN(n)
	for i := 0; i < n && i < 64; i++ {
		a := p.published[(start+i)%n]
		if !p.leased[a] {
			p.leased[a] = true
			return a, func() {
				p.mu.Lock()
				delete(p.leased, a)
				p.mu.Unlock()
			}, nil
		}
	}
	return nil, nil, ErrNoAccount
}

// Random returns any published account without leasing it (for use as the
// target of a follow or mention, never for signing).
func (p *Accounts) Random(r *rand.Rand) *polycentric.Account {
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.published) == 0 {
		return nil
	}
	return p.published[r.IntN(len(p.published))]
}

func (p *Accounts) Get(identity string) *polycentric.Account {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.byID[identity]
}

// Counts returns (total, published, leased).
func (p *Accounts) Counts() (int, int, int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.all), len(p.published), len(p.leased)
}

// All returns a snapshot of every account.
func (p *Accounts) All() []*polycentric.Account {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]*polycentric.Account(nil), p.all...)
}

// Save atomically rewrites path with every account (JSON lines). The file
// holds private keys: it is written 0600.
func (p *Accounts) Save(path string) error {
	if path == "" {
		return nil
	}
	accs := p.All()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	w := bufio.NewWriter(f)
	enc := json.NewEncoder(w)
	for _, a := range accs {
		if err := enc.Encode(a.Export()); err != nil {
			f.Close()
			return err
		}
	}
	if err := w.Flush(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// Load reads accounts saved by Save. A missing file is not an error.
func (p *Accounts) Load(path string) (int, error) {
	f, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 64<<20)
	n := 0
	for sc.Scan() {
		var s polycentric.Stored
		if err := json.Unmarshal(sc.Bytes(), &s); err != nil {
			return n, err
		}
		a, err := polycentric.Import(s)
		if err != nil {
			return n, err
		}
		p.Add(a)
		n++
	}
	return n, sc.Err()
}

// PostRef is a post the test can react to, reply to, quote or repost.
type PostRef struct {
	Key    *pb.EventKey
	Root   *pb.EventKey // thread root when the post is itself a reply
	Author string
	Ours   bool // authored by a load-test account
}

// Posts is a bounded ring of recently seen posts.
type Posts struct {
	mu   sync.Mutex
	ring []PostRef
	next int
	full bool
	seen map[string]bool
}

func NewPosts(capacity int) *Posts {
	if capacity <= 0 {
		capacity = 50_000
	}
	return &Posts{ring: make([]PostRef, capacity), seen: map[string]bool{}}
}

func refID(k *pb.EventKey) string {
	return k.GetIdentity() + "/" + string(k.GetSignedBy().GetKey()) + "/" + itoa(k.GetSequence())
}

func itoa(u uint64) string {
	var b [20]byte
	i := len(b)
	for {
		i--
		b[i] = byte('0' + u%10)
		u /= 10
		if u == 0 {
			break
		}
	}
	return string(b[i:])
}

func (p *Posts) Add(ref PostRef) {
	id := refID(ref.Key)
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.seen[id] {
		return
	}
	if p.full {
		delete(p.seen, refID(p.ring[p.next].Key))
	}
	p.seen[id] = true
	p.ring[p.next] = ref
	p.next++
	if p.next == len(p.ring) {
		p.next, p.full = 0, true
	}
}

func (p *Posts) Len() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.full {
		return len(p.ring)
	}
	return p.next
}

// Pick chooses a post. oursOnly restricts to load-test content (so real
// staging users never receive notifications from the test). skew > 0 favours
// recent posts (Zipf-like exponent); 0 is uniform.
func (p *Posts) Pick(r *rand.Rand, oursOnly bool, skew float64) (PostRef, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	n := p.next
	if p.full {
		n = len(p.ring)
	}
	if n == 0 {
		return PostRef{}, false
	}
	for attempt := 0; attempt < 32; attempt++ {
		var age int
		if skew > 0 {
			// Inverse-CDF of a power law over [0, n): small ages are likelier.
			u := r.Float64()
			age = int(math.Floor(float64(n) * math.Pow(u, 1+skew)))
			if age >= n {
				age = n - 1
			}
		} else {
			age = r.IntN(n)
		}
		idx := (p.next - 1 - age + len(p.ring)) % len(p.ring)
		ref := p.ring[idx]
		if ref.Key == nil || (oursOnly && !ref.Ours) {
			continue
		}
		return ref, true
	}
	return PostRef{}, false
}
