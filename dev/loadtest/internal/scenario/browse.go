package scenario

import (
	"context"
	"math/rand/v2"
	"net/url"
	"strconv"
	"sync"
	"time"

	"code.futo.org/harbor/harbor/dev/loadtest/internal/config"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/harbor"
	pb "code.futo.org/harbor/harbor/dev/loadtest/internal/pb/polycentric/v2"
	"code.futo.org/harbor/harbor/dev/loadtest/internal/polycentric"
	"google.golang.org/protobuf/proto"
)

// session is one visitor's browser tab: its blob cache, its CORS preflight
// cache, and (when logged in) its account.
type session struct {
	e           *Env
	r           *rand.Rand
	acc         *polycentric.Account // signs auth tokens; nil when anonymous
	p           config.Params
	blobs       map[string]bool
	preflight   bool
	preflighted map[string]bool
	mu          sync.Mutex
}

func newSession(e *Env, p config.Params, acc *polycentric.Account) *session {
	r := rand.New(rand.NewPCG(rand.Uint64(), rand.Uint64()))
	return &session{
		e:           e,
		r:           r,
		acc:         acc,
		p:           p,
		blobs:       map[string]bool{},
		preflight:   r.Float64() < p.Float("preflightProb", 0),
		preflighted: map[string]bool{},
	}
}

func (s *session) think(ctx context.Context) error {
	tr := s.p.DurationRange("thinkTime", config.Range[config.Duration]{Min: config.Duration(2 * time.Second), Max: config.Duration(8 * time.Second)})
	d := tr.Min.D()
	if tr.Max > tr.Min {
		d += time.Duration(s.r.Int64N(int64(tr.Max - tr.Min)))
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// rpc calls one server, preceded by a CORS preflight the first time this
// (fresh-browser) session uses the method on that server.
func (s *session) rpc(ctx context.Context, srv *harbor.Server, service, method string, req, resp proto.Message) error {
	if s.preflight {
		k := srv.Label + "/" + method
		s.mu.Lock()
		need := !s.preflighted[k]
		s.preflighted[k] = true
		s.mu.Unlock()
		if need {
			_ = srv.Preflight(ctx, service, method, s.acc != nil)
		}
	}
	return srv.Call(ctx, service, method, req, resp, s.acc)
}

// all fans one RPC out to every server.
func (s *session) all(ctx context.Context, service, method string, req proto.Message, newResp func() proto.Message) ([]proto.Message, error) {
	resps := make([]proto.Message, len(s.e.fanout()))
	err := s.e.each(func(i int, srv *harbor.Server) error {
		resp := newResp()
		if err := s.rpc(ctx, srv, service, method, req, resp); err != nil {
			return err
		}
		resps[i] = resp
		return nil
	})
	return resps, err
}

// feed pages through one feed across all servers, keeping each server's own
// cursor as the client does.
type feed struct {
	s        *session
	service  string
	method   string
	build    func(cursor *string) proto.Message
	cursors  []*string
	failed   []bool
	buffer   []post
	seen     map[string]bool
	rendered int
}

func (s *session) newFeed(method string, build func(cursor *string) proto.Message) *feed {
	n := len(s.e.fanout())
	return &feed{s: s, service: "FeedsService", method: method, build: build, cursors: make([]*string, n), failed: make([]bool, n), seen: map[string]bool{}}
}

// fetch loads the next page from every server that has not failed and
// merges new rows into the buffer.
func (f *feed) fetch(ctx context.Context) error {
	s := f.s
	pages := make([][]post, len(f.failed))
	err := s.e.each(func(i int, srv *harbor.Server) error {
		if f.failed[i] {
			return nil
		}
		var resp pb.GetFeedResponse
		if err := s.rpc(ctx, srv, f.service, f.method, f.build(f.cursors[i]), &resp); err != nil {
			f.failed[i] = true // the client stops asking a server that failed
			return err
		}
		if pi := resp.GetPageInfo(); pi != nil && pi.EndCursor != "" {
			c := pi.EndCursor
			f.cursors[i] = &c
		}
		pages[i] = s.e.parseFeed(resp.EventBundles, resp.EventHints, 40)
		return nil
	})
	// Interleave servers so both contribute to what is rendered first.
	for idx := 0; ; idx++ {
		added := false
		for _, pg := range pages {
			if idx < len(pg) {
				added = true
				id := keyID(pg[idx].key)
				if !f.seen[id] {
					f.seen[id] = true
					f.buffer = append(f.buffer, pg[idx])
				}
			}
		}
		if !added {
			break
		}
	}
	return err
}

// render loads images for the next n rows, as the virtualised list mounts
// them, and returns those rows.
func (f *feed) render(ctx context.Context, n int) []post {
	end := min(f.rendered+n, len(f.buffer))
	rows := f.buffer[f.rendered:end]
	f.rendered = end
	f.s.loadImages(ctx, rows)
	return rows
}

func (f *feed) shown() []post { return f.buffer[:f.rendered] }

// loadImages fetches avatars, post images and (optionally) link-preview
// thumbnails for rows, at most 6 at a time, skipping blobs this tab already
// has cached.
func (s *session) loadImages(ctx context.Context, rows []post) {
	if !s.p.Bool("images", true) {
		return
	}
	primary := s.e.Primary()
	bust := s.p.Bool("cacheBust", false)
	proxy := s.p.Bool("imageProxy", false)
	var urls []struct{ name, url string }
	s.mu.Lock()
	add := func(name, u string) {
		if s.blobs[u] {
			return
		}
		s.blobs[u] = true
		if bust {
			u += "?lt=" + strconv.FormatUint(s.r.Uint64(), 36)
		}
		urls = append(urls, struct{ name, url string }{name, u})
	}
	for _, p := range rows {
		if p.avatar != nil {
			add("GET /blob", primary.BlobURL(p.avatar))
		}
		for _, d := range p.images {
			add("GET /blob", primary.BlobURL(d))
		}
		if proxy && p.linkImg != "" {
			add("GET /image_proxy", primary.URL+"/image_proxy?url="+url.QueryEscape(p.linkImg))
		}
	}
	s.mu.Unlock()
	sem := make(chan struct{}, 6)
	var wg sync.WaitGroup
	for _, u := range urls {
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			_ = primary.Get(ctx, u.name, u.url)
		}()
	}
	wg.Wait()
}

// scroll performs one scroll step: every scroll trigger fetches the next
// page from every server, then the next rows are mounted.
func (f *feed) scroll(ctx context.Context) error {
	err := f.fetch(ctx)
	f.render(ctx, f.s.p.Int("rowsPerScroll", 15))
	return err
}

func (s *session) pick(rows []post) (post, bool) {
	if len(rows) == 0 {
		return post{}, false
	}
	return rows[s.r.IntN(len(rows))], true
}

// openThread opens a post from the feed (GetPost is skipped because the
// post is already local) and renders the thread.
func (s *session) openThread(ctx context.Context, p post) error {
	resps, err := s.all(ctx, "FeedsService", "GetPostThread", &pb.GetPostThreadRequest{EventKey: p.key}, func() proto.Message { return &pb.GetPostThreadResponse{} })
	var rows []post
	for _, r := range resps {
		if r == nil {
			continue
		}
		tr := r.(*pb.GetPostThreadResponse)
		rows = append(rows, s.e.parseFeed(tr.Thread, tr.EventHints, 40)...)
	}
	if len(rows) > 12 {
		rows = rows[:12]
	}
	s.loadImages(ctx, rows)
	return err
}

// openProfile views an author's profile: GetProfile and the first page of
// their posts from every server (plus IsModerator again when logged in, as
// the profile menu re-subscribes to it).
func (s *session) openProfile(ctx context.Context, identity string) error {
	var wg sync.WaitGroup
	var errProfile, errMod error
	wg.Add(1)
	go func() {
		defer wg.Done()
		_, errProfile = s.all(ctx, "ProfileService", "GetProfile", &pb.GetProfileRequest{Identity: identity}, func() proto.Message { return &pb.GetProfileResponse{} })
	}()
	if s.acc != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errMod = s.all(ctx, "IdentityService", "IsModerator", &pb.IsModeratorRequest{}, func() proto.Message { return &pb.IsModeratorResponse{} })
		}()
	}
	f := s.newFeed("GetIdentityFeed", func(cursor *string) proto.Message {
		pp := &pb.PageParams{ForwardToken: cursor}
		return &pb.GetIdentityFeedRequest{Identity: identity, PageParams: pp}
	})
	errFeed := f.fetch(ctx)
	f.render(ctx, s.p.Int("rowsFirstRender", 12))
	wg.Wait()
	if errProfile != nil {
		return errProfile
	}
	if errMod != nil {
		return errMod
	}
	return errFeed
}

// wander is the common scroll loop: think, scroll, and sometimes open a
// thread or a profile before continuing.
func (s *session) wander(ctx context.Context, f *feed) error {
	steps := randRange(s.r, s.p.IntRange("scrollSteps", config.Range[int]{Min: 1, Max: 6}))
	var firstErr error
	note := func(err error) {
		if err != nil && firstErr == nil {
			firstErr = err
		}
	}
	for i := 0; i < steps; i++ {
		if err := s.think(ctx); err != nil {
			return err
		}
		if s.r.Float64() < s.p.Float("threadProb", 0)/float64(steps) {
			if p, ok := s.pick(f.shown()); ok {
				note(s.openThread(ctx, p))
				if err := s.think(ctx); err != nil {
					return err
				}
			}
		}
		if s.r.Float64() < s.p.Float("profileProb", 0)/float64(steps) {
			if p, ok := s.pick(f.shown()); ok {
				note(s.openProfile(ctx, p.author))
				if err := s.think(ctx); err != nil {
					return err
				}
			}
		}
		note(f.scroll(ctx))
	}
	return firstErr
}

func sortBy(v pb.SortPostsBy) *pb.SortPostsBy { return &v }

func limit(n int32) *int32 { return &n }

// Browse is an anonymous visitor: load the web app, land on Explore (Top by
// default), scroll, and sometimes open threads and profiles.
func Browse(e *Env, p config.Params) func(ctx context.Context) error {
	return func(ctx context.Context) error {
		s := newSession(e, p, nil)
		return harbor.Timed(e.Rec, "session:browse", func() error {
			if p.Bool("loadWebApp", true) && e.Web != nil {
				if err := webGet(ctx, e, "GET web /", e.Web.BaseURL+"/"); err != nil {
					return err
				}
				// Fresh browsers also download the bundle, CSS and fonts;
				// returning visitors have them cached.
				if p.Bool("loadStaticAssets", false) && s.preflight {
					for _, a := range e.staticAssets(ctx) {
						_ = webGet(ctx, e, "GET static", a)
					}
				}
			}
			sort := pb.SortPostsBy_SORT_POSTS_BY_TOP
			if s.r.Float64() >= p.Float("sortTopShare", 0.8) {
				sort = pb.SortPostsBy_SORT_POSTS_BY_LATEST
			}
			f := s.newFeed("GetExploreFeed", func(cursor *string) proto.Message {
				return &pb.GetExploreFeedRequest{PageParams: &pb.PageParams{Limit: limit(50), ForwardToken: cursor}, SortBy: sortBy(sort)}
			})
			err := f.fetch(ctx)
			f.render(ctx, p.Int("rowsFirstRender", 12))
			if err != nil {
				return err
			}
			return s.wander(ctx, f)
		})
	}
}

// BrowseUser is a returning logged-in user: startup sync, IsModerator, land
// on Following (Latest) / For you / Explore, scroll, and sometimes open
// threads, profiles, or notifications.
func BrowseUser(e *Env, p config.Params) func(ctx context.Context) error {
	return func(ctx context.Context) error {
		acc, release, err := e.Accounts.Lease(rand.New(rand.NewPCG(rand.Uint64(), rand.Uint64())))
		if err != nil {
			e.Rec.Record("skipped", 0, 0, 0, "session:browse_user no_account")
			return err
		}
		defer release()
		caller := acc
		if !p.Bool("authReads", true) {
			caller = nil
		}
		s := newSession(e, p, caller)
		return harbor.Timed(e.Rec, "session:browse_user", func() error {
			if err := s.startup(ctx, acc); err != nil {
				return err
			}
			return s.landAndWander(ctx, acc, true)
		})
	}
}

// startup is the logged-in app's boot sync: a pull of our own events
// alongside ListHeads on every server, then IsModerator.
func (s *session) startup(ctx context.Context, acc *polycentric.Account) error {
	id := acc.Identity()
	heads := acc.Heads()
	err := s.e.each(func(_ int, srv *harbor.Server) error {
		var wg sync.WaitGroup
		var pullErr error
		wg.Add(1)
		go func() {
			defer wg.Done()
			pullErr = s.rpc(ctx, srv, "EventSyncService", "ListEvents", &pb.ListEventsRequest{Filters: &pb.ListEventsFilters{Identity: &id, Heads: heads}}, &pb.ListEventsResponse{})
		}()
		headsErr := s.rpc(ctx, srv, "EventSyncService", "ListHeads", &pb.ListHeadsRequest{Identity: id}, &pb.ListHeadsResponse{})
		wg.Wait()
		if pullErr != nil {
			return pullErr
		}
		return headsErr
	})
	if err != nil {
		return err
	}
	_, err = s.all(ctx, "IdentityService", "IsModerator", &pb.IsModeratorRequest{}, func() proto.Message { return &pb.IsModeratorResponse{} })
	return err
}

func (s *session) landAndWander(ctx context.Context, acc *polycentric.Account, wander bool) error {
	id := acc.Identity()
	var f *feed
	switch x := s.r.Float64(); {
	case x < s.p.Float("landingFollowing", 0.7):
		f = s.newFeed("GetFollowingFeed", func(cursor *string) proto.Message {
			return &pb.GetFollowingFeedRequest{FollowerIdentity: id, PageParams: &pb.PageParams{Limit: limit(50), ForwardToken: cursor}, SortBy: sortBy(pb.SortPostsBy_SORT_POSTS_BY_LATEST)}
		})
	case x < s.p.Float("landingFollowing", 0.7)+s.p.Float("landingForYou", 0.15):
		f = s.newFeed("GetRecommendedFeed", func(cursor *string) proto.Message {
			return &pb.GetFollowingFeedRequest{FollowerIdentity: id, PageParams: &pb.PageParams{Limit: limit(50), ForwardToken: cursor}, SortBy: sortBy(pb.SortPostsBy_SORT_POSTS_BY_TOP)}
		})
	default:
		f = s.newFeed("GetExploreFeed", func(cursor *string) proto.Message {
			return &pb.GetExploreFeedRequest{Identity: &id, PageParams: &pb.PageParams{Limit: limit(50), ForwardToken: cursor}, SortBy: sortBy(pb.SortPostsBy_SORT_POSTS_BY_TOP)}
		})
	}
	var wg sync.WaitGroup
	if s.r.Float64() < s.p.Float("suggestFollow", 0.7) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = s.all(ctx, "GraphService", "SuggestFollow", &pb.SuggestFollowRequest{PageParams: &pb.PageParams{Limit: limit(5)}}, func() proto.Message { return &pb.SuggestFollowResponse{} })
		}()
	}
	err := f.fetch(ctx)
	f.render(ctx, s.p.Int("rowsFirstRender", 12))
	wg.Wait()
	if err != nil || !wander {
		return err
	}
	if s.r.Float64() < s.p.Float("notificationProb", 0) {
		if err := s.think(ctx); err != nil {
			return err
		}
		resps, err := s.all(ctx, "NotificationService", "ListNotifications", &pb.ListNotificationsRequest{Identity: id}, func() proto.Message { return &pb.ListNotificationsResponse{} })
		if err != nil {
			return err
		}
		var rows []post
		for _, r := range resps {
			if r == nil {
				continue
			}
			for _, n := range r.(*pb.ListNotificationsResponse).Notifications {
				if n.TriggerEvent != nil {
					rows = append(rows, s.e.parseFeed([]*pb.EventBundle{n.TriggerEvent}, nil, 40)...)
				}
			}
		}
		if len(rows) > 12 {
			rows = rows[:12]
		}
		s.loadImages(ctx, rows)
	}
	return s.wander(ctx, f)
}

func webGet(ctx context.Context, e *Env, name, u string) error {
	return harbor.RecordGet(ctx, e.Rec, e.Web, name, u)
}
