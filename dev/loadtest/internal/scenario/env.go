// Package scenario implements the user behaviours the load test simulates,
// replaying the Harbor web client's request patterns (see README for the
// per-scenario call scripts).
package scenario

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"net/url"
	"regexp"
	"sync"

	"code.futo.org/harbor/harbor/dev/loadtest/internal/config"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/grpcweb"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/harbor"
	pb "code.futo.org/harbor/harbor/dev/loadtest/internal/pb/polycentric/v2"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/polycentric"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/stats"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/world"
	"google.golang.org/protobuf/proto"
)

// Env is shared by every scenario iteration.
type Env struct {
	Cfg      *config.Config
	Servers  []*harbor.Server // fan-out set, app order
	Web      *grpcweb.Client  // web app origin (HTML, static assets)
	Rec      *stats.Recorder
	Accounts *world.Accounts
	Posts    *world.Posts
	Corpus   *world.Corpus
	// OnAccount is called whenever an account is created or changes, so the
	// engine can persist it.
	OnAccount func(*polycentric.Account)

	assetsOnce sync.Once
	assets     []string
}

var assetRe = regexp.MustCompile(`(?:src|href)="([^"]+\.(?:js|css|ttf|woff2?))"`)

// staticAssets discovers (once) the scripts, stylesheets and fonts the web
// app's HTML references, resolved against the web origin.
func (e *Env) staticAssets(ctx context.Context) []string {
	e.assetsOnce.Do(func() {
		if e.Web == nil {
			return
		}
		body, err := e.Web.Fetch(ctx, e.Web.BaseURL+"/")
		if err != nil {
			return
		}
		base, _ := url.Parse(e.Web.BaseURL + "/")
		seen := map[string]bool{}
		for _, m := range assetRe.FindAllStringSubmatch(string(body), -1) {
			ref, err := url.Parse(m[1])
			if err != nil {
				continue
			}
			abs := base.ResolveReference(ref).String()
			if !seen[abs] {
				seen[abs] = true
				e.assets = append(e.assets, abs)
			}
		}
	})
	return e.assets
}

// Primary is the server used for blob and image-proxy GETs.
func (e *Env) Primary() *harbor.Server { return e.Servers[0] }

// fanout returns the servers each RPC is sent to.
func (e *Env) fanout() []*harbor.Server {
	if e.Cfg.Target.Fanout == "first" {
		return e.Servers[:1]
	}
	return e.Servers
}

// each runs fn against every fan-out server in parallel and returns the
// first error (after all have finished, like the app waiting for every
// server before rendering).
func (e *Env) each(fn func(i int, s *harbor.Server) error) error {
	srvs := e.fanout()
	if len(srvs) == 1 {
		return fn(0, srvs[0])
	}
	errs := make([]error, len(srvs))
	var wg sync.WaitGroup
	for i, s := range srvs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs[i] = fn(i, s)
		}()
	}
	wg.Wait()
	return errors.Join(errs...)
}

// publish syncs freshly built events the way the app does after a local
// write (sync PARTIAL): per server, a pull (ListEvents with our heads) runs
// alongside ListHeads followed by PutEvents.
func (e *Env) publish(ctx context.Context, acc *polycentric.Account, bundles []*pb.EventBundle, caller *polycentric.Account) (*pb.PutEventsResponse, error) {
	heads := acc.Heads()
	id := acc.Identity()
	var mu sync.Mutex
	var first *pb.PutEventsResponse
	err := e.each(func(_ int, s *harbor.Server) error {
		var wg sync.WaitGroup
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = s.Call(ctx, "EventSyncService", "ListEvents", &pb.ListEventsRequest{
				Filters: &pb.ListEventsFilters{Identity: &id, Heads: heads},
			}, &pb.ListEventsResponse{}, caller)
		}()
		var putErr error
		if err := s.Call(ctx, "EventSyncService", "ListHeads", &pb.ListHeadsRequest{Identity: id}, &pb.ListHeadsResponse{}, caller); err != nil {
			putErr = err
		} else {
			resp, err := s.PutEvents(ctx, bundles, caller)
			putErr = err
			mu.Lock()
			if first == nil {
				first = resp
			}
			mu.Unlock()
		}
		wg.Wait()
		return putErr
	})
	if e.OnAccount != nil {
		e.OnAccount(acc)
	}
	return first, err
}

// uploadImage uploads every variant of img to every server, as the
// composer does before publishing, and returns the ImageSet to reference.
func (e *Env) uploadImage(ctx context.Context, img world.ImageSetData, caller *polycentric.Account) (*pb.ImageSet, error) {
	set := &pb.ImageSet{}
	for _, v := range img.Variants {
		set.Images = append(set.Images, &pb.Image{Blob: v.Blob, Width: v.Width, Height: v.Height})
	}
	err := e.each(func(_ int, s *harbor.Server) error {
		for _, v := range img.Variants {
			if err := s.UploadBlob(ctx, v.Blob, v.Body, caller); err != nil {
				return err
			}
		}
		return nil
	})
	return set, err
}

// post is a feed row as the client renders it.
type post struct {
	key      *pb.EventKey
	root     *pb.EventKey
	author   string
	images   []*pb.ContentDigest // one chosen variant per image set
	avatar   *pb.ContentDigest
	linkImg  string
	isRepost bool
}

func keyID(k *pb.EventKey) string {
	return fmt.Sprintf("%d/%s/%x/%d", k.GetCollection(), k.GetIdentity(), k.GetSignedBy().GetKey(), k.GetSequence())
}

type decoded struct {
	key     *pb.EventKey
	content *pb.Content
}

func decode(b *pb.EventBundle) (decoded, bool) {
	var ev pb.Event
	if err := proto.Unmarshal(b.GetSignedEvent().GetEventBytes(), &ev); err != nil || ev.Key == nil {
		return decoded{}, false
	}
	var c pb.Content
	if b.GetSerializedContent() != nil {
		if err := proto.Unmarshal(b.GetSerializedContent().GetContentBytes(), &c); err != nil {
			return decoded{}, false
		}
	}
	return decoded{key: ev.Key, content: &c}, true
}

// pickImage chooses the smallest variant at least minWidth wide, falling
// back to the largest (mirrors the client's image selection).
func pickImage(set *pb.ImageSet, minWidth int32) *pb.ContentDigest {
	var best, largest *pb.Image
	for _, img := range set.GetImages() {
		if img.GetBlob().GetDigest() == nil {
			continue
		}
		if largest == nil || img.Width > largest.Width {
			largest = img
		}
		if img.Width >= minWidth && (best == nil || img.Width < best.Width) {
			best = img
		}
	}
	if best == nil {
		best = largest
	}
	if best == nil {
		return nil
	}
	return best.Blob.Digest
}

// parseFeed turns a feed response (bundles + hints) into rows, resolving
// avatars and repost targets from the hints like the client does.
func (e *Env) parseFeed(bundles []*pb.EventBundle, hints []*pb.EventHint, avatarWidth int32) []post {
	avatars := map[string]*pb.ContentDigest{}
	avatarSeq := map[string]uint64{}
	byKey := map[string]decoded{}
	for _, h := range hints {
		d, ok := decode(h.GetEventBundle())
		if !ok {
			continue
		}
		switch body := d.content.ContentBody.(type) {
		case *pb.Content_ProfileUpdate:
			if av := body.ProfileUpdate.GetAvatar(); av != nil && d.key.Sequence >= avatarSeq[d.key.Identity] {
				if dg := pickImage(av, avatarWidth); dg != nil {
					avatars[d.key.Identity] = dg
					avatarSeq[d.key.Identity] = d.key.Sequence
				}
			}
		case *pb.Content_Post:
			byKey[keyID(d.key)] = d
		}
	}
	rows := make([]post, 0, len(bundles))
	for _, b := range bundles {
		d, ok := decode(b)
		if !ok {
			continue
		}
		p := post{key: d.key, author: d.key.Identity}
		target := d
		if rp, ok := d.content.ContentBody.(*pb.Content_Repost); ok {
			p.isRepost = true
			if t, ok := byKey[keyID(rp.Repost.GetPost())]; ok {
				target = t
			}
		}
		if tp := target.content.GetPost(); tp != nil {
			for _, set := range tp.Images {
				if dg := pickImage(set, 512); dg != nil {
					p.images = append(p.images, dg)
				}
			}
			if len(tp.Links) > 0 {
				p.linkImg = tp.Links[0].Image
			}
			if r := tp.GetReply(); r != nil {
				p.root = r.GetRoot()
			}
			if p.isRepost {
				p.key, p.author = target.key, target.key.Identity
			}
		}
		p.avatar = avatars[p.author]
		rows = append(rows, p)
		if !p.isRepost || target.content.GetPost() != nil {
			e.Posts.Add(world.PostRef{Key: p.key, Root: p.root, Author: p.author, Ours: e.Accounts.Get(p.author) != nil})
		}
	}
	return rows
}

func randRange(r *rand.Rand, rg config.Range[int]) int {
	if rg.Max <= rg.Min {
		return rg.Min
	}
	return rg.Min + r.IntN(rg.Max-rg.Min+1)
}
