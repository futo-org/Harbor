package scenario

import (
	"context"
	"errors"
	"math/rand/v2"

	"code.futo.org/harbor/harbor/dev/loadtest/internal/config"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/harbor"
	pb "code.futo.org/harbor/harbor/dev/loadtest/internal/pb/polycentric/v2"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/polycentric"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/world"
	"google.golang.org/protobuf/proto"
)

func newRand() *rand.Rand { return rand.New(rand.NewPCG(rand.Uint64(), rand.Uint64())) }

// Register creates an identity the way onboarding does: publish the genesis
// identity event (ListHeads then PutEvents on every server), publish the
// profile (display name) with a sync, optionally follow some existing
// load-test accounts, then land on the logged-in feed.
func Register(e *Env, p config.Params) func(ctx context.Context) error {
	return func(ctx context.Context) error {
		r := newRand()
		urls := make([]string, 0, len(e.Servers))
		for _, s := range e.Servers {
			urls = append(urls, s.URL)
		}
		acc := polycentric.NewAccount(urls)
		acc.Name = e.Corpus.Name(r)
		e.Accounts.Add(acc)
		return harbor.Timed(e.Rec, "flow:register", func() error {
			genesis := acc.GenesisEvent()
			id := acc.Identity()
			err := e.each(func(_ int, s *harbor.Server) error {
				if err := s.Call(ctx, "EventSyncService", "ListHeads", &pb.ListHeadsRequest{Identity: id}, &pb.ListHeadsResponse{}, acc); err != nil {
					return err
				}
				_, err := s.PutEvents(ctx, []*pb.EventBundle{genesis}, acc)
				return err
			})
			if e.OnAccount != nil {
				e.OnAccount(acc)
			}
			if err != nil {
				return err
			}
			name := acc.Name
			empty := ""
			profile := acc.Build(polycentric.CollProfile, &pb.Content{ContentBody: &pb.Content_ProfileUpdate{
				ProfileUpdate: &pb.ProfileUpdate{Name: &name, Description: &empty},
			}})
			if _, err := e.publish(ctx, acc, []*pb.EventBundle{profile}, acc); err != nil {
				return err
			}
			e.Accounts.Published(acc)
			if n := p.Int("followOnSignup", 0); n > 0 {
				var follows []*pb.EventBundle
				seen := map[string]bool{id: true}
				for i := 0; i < n*3 && len(follows) < n; i++ {
					t := e.Accounts.Random(r)
					if t == nil || seen[t.Identity()] {
						continue
					}
					seen[t.Identity()] = true
					follows = append(follows, acc.Build(polycentric.CollSocialGraph, &pb.Content{ContentBody: &pb.Content_Follow{Follow: &pb.Follow{Identity: t.Identity()}}}))
				}
				if len(follows) > 0 {
					if _, err := e.publish(ctx, acc, follows, acc); err != nil {
						return err
					}
				}
			}
			if p.Bool("browseAfterSignup", true) {
				s := newSession(e, config.Params{"images": true, "landingFollowing": 1.0, "suggestFollow": 0.7}, acc)
				if _, err := s.all(ctx, "IdentityService", "IsModerator", &pb.IsModeratorRequest{}, func() proto.Message { return &pb.IsModeratorResponse{} }); err != nil {
					return err
				}
				return s.landAndWander(ctx, acc, false)
			}
			return nil
		})
	}
}

// lease borrows an idle account, recording a no_account failure for flow
// when none is available.
func (e *Env) lease(flow string, r *rand.Rand) (*polycentric.Account, func(), error) {
	acc, release, err := e.Accounts.Lease(r)
	if err != nil {
		e.Rec.Record("skipped", 0, 0, 0, flow+" no_account")
	}
	return acc, release, err
}

// pickTarget chooses a post to interact with. Unless content.interactWithReal
// is set, only load-test posts are eligible, so real staging users never get
// notifications from the test.
func (e *Env) pickTarget(flow string, r *rand.Rand, skew float64) (world.PostRef, error) {
	ref, ok := e.Posts.Pick(r, !e.Cfg.Content.InteractWithReal, skew)
	if !ok {
		e.Rec.Record("skipped", 0, 0, 0, flow+" no_target")
		return ref, errNoTarget
	}
	return ref, nil
}

var errNoTarget = errors.New("no post to interact with yet")

// Post publishes a top-level post (sometimes with an image, a quote, or a
// mention of another load-test account).
func Post(e *Env, p config.Params) func(ctx context.Context) error {
	return func(ctx context.Context) error {
		r := newRand()
		acc, release, err := e.lease("flow:post", r)
		if err != nil {
			return err
		}
		defer release()
		return harbor.Timed(e.Rec, "flow:post", func() error {
			post := &pb.Post{Text: e.Corpus.PostText(r), Labels: e.Corpus.Labels()}
			if r.Float64() < p.Float("mentionProb", 0) {
				if t := e.Accounts.Random(r); t != nil && t != acc {
					post.Text = world.Mention(t.Identity(), t.Name) + " " + post.Text
				}
			}
			if r.Float64() < p.Float("quoteProb", 0) {
				if ref, ok := e.Posts.Pick(r, !e.Cfg.Content.InteractWithReal, 1); ok {
					post.Quote = ref.Key
				}
			}
			if r.Float64() < p.Float("imageProb", 0) {
				set, err := e.uploadImage(ctx, e.Corpus.Image(r), acc)
				if err != nil {
					return err
				}
				post.Images = []*pb.ImageSet{set}
			}
			b := acc.Build(polycentric.CollFeed, &pb.Content{ContentBody: &pb.Content_Post{Post: post}})
			if _, err := e.publish(ctx, acc, []*pb.EventBundle{b}, acc); err != nil {
				return err
			}
			if k, err := polycentric.KeyOf(b); err == nil {
				e.Posts.Add(world.PostRef{Key: k, Author: acc.Identity(), Ours: true})
			}
			return nil
		})
	}
}

// Reply answers an existing post (root = the thread's root, parent = the
// post), as the composer does.
func Reply(e *Env, p config.Params) func(ctx context.Context) error {
	return func(ctx context.Context) error {
		r := newRand()
		target, err := e.pickTarget("flow:reply", r, p.Float("targetSkew", 1))
		if err != nil {
			return err
		}
		acc, release, err := e.lease("flow:reply", r)
		if err != nil {
			return err
		}
		defer release()
		return harbor.Timed(e.Rec, "flow:reply", func() error {
			root := target.Root
			if root == nil {
				root = target.Key
			}
			words := randRange(r, p.IntRange("textWords", config.Range[int]{Min: 2, Max: 25}))
			post := &pb.Post{
				Text:   e.Corpus.FreeText(r, words),
				Reply:  &pb.PostReply{Root: root, Parent: target.Key},
				Labels: e.Corpus.Labels(),
			}
			b := acc.Build(polycentric.CollFeed, &pb.Content{ContentBody: &pb.Content_Post{Post: post}})
			if _, err := e.publish(ctx, acc, []*pb.EventBundle{b}, acc); err != nil {
				return err
			}
			if k, err := polycentric.KeyOf(b); err == nil {
				e.Posts.Add(world.PostRef{Key: k, Root: root, Author: acc.Identity(), Ours: true})
			}
			return nil
		})
	}
}

// React likes (or occasionally downvotes) a post.
func React(e *Env, p config.Params) func(ctx context.Context) error {
	return func(ctx context.Context) error {
		r := newRand()
		target, err := e.pickTarget("flow:react", r, p.Float("targetSkew", 1))
		if err != nil {
			return err
		}
		acc, release, err := e.lease("flow:react", r)
		if err != nil {
			return err
		}
		defer release()
		return harbor.Timed(e.Rec, "flow:react", func() error {
			emoji := e.Corpus.Emoji(r)
			b := acc.Build(polycentric.CollInteractions, &pb.Content{ContentBody: &pb.Content_Reaction{Reaction: &pb.Reaction{
				EventKey: target.Key,
				Emoji:    &emoji,
				Positive: r.Float64() >= p.Float("negativeProb", 0.05),
			}}})
			_, err := e.publish(ctx, acc, []*pb.EventBundle{b}, acc)
			return err
		})
	}
}

// Repost reposts a post.
func Repost(e *Env, p config.Params) func(ctx context.Context) error {
	return func(ctx context.Context) error {
		r := newRand()
		target, err := e.pickTarget("flow:repost", r, p.Float("targetSkew", 1))
		if err != nil {
			return err
		}
		acc, release, err := e.lease("flow:repost", r)
		if err != nil {
			return err
		}
		defer release()
		return harbor.Timed(e.Rec, "flow:repost", func() error {
			b := acc.Build(polycentric.CollFeed, &pb.Content{ContentBody: &pb.Content_Repost{Repost: &pb.Repost{Post: target.Key}}})
			_, err := e.publish(ctx, acc, []*pb.EventBundle{b}, acc)
			return err
		})
	}
}

// Follow has one load-test account follow another.
func Follow(e *Env, _ config.Params) func(ctx context.Context) error {
	return func(ctx context.Context) error {
		r := newRand()
		acc, release, err := e.lease("flow:follow", r)
		if err != nil {
			return err
		}
		defer release()
		var target *polycentric.Account
		for i := 0; i < 8; i++ {
			if t := e.Accounts.Random(r); t != nil && t != acc {
				target = t
				break
			}
		}
		if target == nil {
			e.Rec.Record("skipped", 0, 0, 0, "flow:follow no_target")
			return errNoTarget
		}
		return harbor.Timed(e.Rec, "flow:follow", func() error {
			b := acc.Build(polycentric.CollSocialGraph, &pb.Content{ContentBody: &pb.Content_Follow{Follow: &pb.Follow{Identity: target.Identity()}}})
			_, err := e.publish(ctx, acc, []*pb.EventBundle{b}, acc)
			return err
		})
	}
}

// Search runs a post or user search on every server.
func Search(e *Env, p config.Params) func(ctx context.Context) error {
	return func(ctx context.Context) error {
		s := newSession(e, p, nil)
		return harbor.Timed(e.Rec, "flow:search", func() error {
			if s.r.Float64() < p.Float("usersShare", 0.3) {
				q := e.Corpus.Name(s.r)
				if len(q) > 12 {
					q = q[:12]
				}
				_, err := s.all(ctx, "SearchService", "SearchUsers", &pb.SearchUsersRequest{Query: q, PageParams: &pb.PageParams{Limit: limit(20)}}, func() proto.Message { return &pb.SearchUsersResponse{} })
				return err
			}
			resps, err := s.all(ctx, "SearchService", "SearchPosts", &pb.SearchPostsRequest{Query: e.Corpus.SearchTerm(s.r), PageParams: &pb.PageParams{Limit: limit(50)}}, func() proto.Message { return &pb.SearchPostsResponse{} })
			var rows []post
			for _, r := range resps {
				if r == nil {
					continue
				}
				sr := r.(*pb.SearchPostsResponse)
				bundles := make([]*pb.EventBundle, 0, len(sr.Results))
				for _, res := range sr.Results {
					bundles = append(bundles, res.EventBundle)
				}
				rows = append(rows, e.parseFeed(bundles, sr.EventHints, 40)...)
			}
			if len(rows) > 12 {
				rows = rows[:12]
			}
			s.loadImages(ctx, rows)
			return err
		})
	}
}
