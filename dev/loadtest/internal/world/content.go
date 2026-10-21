package world

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"math"
	"math/rand/v2"
	"strings"
	"sync"

	pb "code.futo.org/harbor/harbor/dev/loadtest/internal/pb/polycentric/v2"
)

var words = strings.Fields(`
the harbor tide sail anchor morning coffee river light city night garden
signal build ship code server window cloud rain summer winter autumn spring
music photo walk bridge street market bread tea book story friend weekend
travel mountain forest ocean island train station bicycle map compass
quiet bright warm cold small big new old early late simple strange
learning writing reading cooking running thinking making fixing testing
today tomorrow yesterday always never sometimes often maybe really just
great good nice fun weird lovely calm busy slow fast open free
thought idea plan project update note question answer reason detail
local global public private shared distributed network protocol federated
keys identity feed post reply thread follow like repost profile server
and with from into about over under after before while because though
we they you it this that these those every some many few more most
see try find make take give show keep start finish share post read
`)

var adjectives = strings.Fields(`amber brisk calm dapper eager fuzzy gentle hazy jolly keen lucid mellow
nimble oaken plucky quiet rustic sunny tidy upbeat vivid witty zesty breezy cosmic dusky
fabled golden humble ivory jaunty lunar misty noble`)

var animals = strings.Fields(`otter heron badger falcon lynx marten osprey puffin raven seal stoat tern
vole wren yak zebu bison crane dingo egret ferret gecko hare ibis koala lemur moose newt
orca panda quail robin`)

var emojis = []string{"👍", "❤️", "😂", "🎉", "🔥", "👀", "🙏", "💯"}

// Corpus generates post text, display names, and images.
type Corpus struct {
	uniquePosts bool
	posts       []string
	names       []string
	label       bool

	imgOnce  sync.Once
	variants []int
	nImages  int
	images   []ImageSetData
}

// ImageSetData is one image in every variant size, ready to upload.
type ImageSetData struct {
	Variants []ImageVariant
}

type ImageVariant struct {
	Body   []byte
	Blob   *pb.Blob
	Width  int32
	Height int32
}

func NewCorpus(size int, unique, loadtestLabel bool, namePrefix string, variants []int, nImages int) *Corpus {
	if size <= 0 {
		size = 500
	}
	r := rand.New(rand.NewPCG(1, 2)) // fixed seed: the same corpus every run
	c := &Corpus{uniquePosts: unique, label: loadtestLabel, variants: variants, nImages: max(nImages, 1)}
	for i := 0; i < size; i++ {
		c.posts = append(c.posts, sentence(r, 4+r.IntN(30)))
	}
	for _, a := range adjectives {
		for _, n := range animals {
			c.names = append(c.names, strings.TrimSpace(namePrefix+" "+title(a)+" "+title(n)))
		}
	}
	return c
}

func title(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func sentence(r *rand.Rand, n int) string {
	var b strings.Builder
	for i := 0; i < n; i++ {
		w := words[r.IntN(len(words))]
		if i == 0 {
			w = title(w)
		} else {
			b.WriteByte(' ')
		}
		b.WriteString(w)
	}
	switch r.IntN(4) {
	case 0:
		b.WriteByte('!')
	case 1:
		b.WriteByte('?')
	default:
		b.WriteByte('.')
	}
	return b.String()
}

// PostText returns text for a new top-level post.
func (c *Corpus) PostText(r *rand.Rand) string {
	t := c.posts[r.IntN(len(c.posts))]
	if c.uniquePosts {
		t += fmt.Sprintf(" #%x", r.Uint64())
	}
	return t
}

// FreeText returns random text of n words (used where the content is
// unique anyway, e.g. replies).
func (c *Corpus) FreeText(r *rand.Rand, n int) string { return sentence(r, max(n, 1)) }

// Name returns a display name from a bounded set.
func (c *Corpus) Name(r *rand.Rand) string { return c.names[r.IntN(len(c.names))] }

// Labels are the self-labels the app applies ("harbor") plus "loadtest".
func (c *Corpus) Labels() []string {
	if c.label {
		return []string{"harbor", "loadtest"}
	}
	return []string{"harbor"}
}

func (c *Corpus) Emoji(r *rand.Rand) string { return emojis[r.IntN(len(emojis))] }

// SearchTerm returns a word likely to match posts.
func (c *Corpus) SearchTerm(r *rand.Rand) string { return words[r.IntN(len(words))] }

// Image returns one of a fixed set of generated images (generated lazily).
func (c *Corpus) Image(r *rand.Rand) ImageSetData {
	c.imgOnce.Do(c.genImages)
	return c.images[r.IntN(len(c.images))]
}

func (c *Corpus) genImages() {
	variants := c.variants
	if len(variants) == 0 {
		variants = []int{512, 1280}
	}
	for i := 0; i < c.nImages; i++ {
		var set ImageSetData
		for _, edge := range variants {
			w, h := edge, edge*3/4
			body := renderJPEG(i, w, h)
			sum := sha256.Sum256(body)
			set.Variants = append(set.Variants, ImageVariant{
				Body: body,
				Blob: &pb.Blob{
					Digest:   &pb.ContentDigest{Type: pb.ContentDigestType_CONTENT_DIGEST_TYPE_SHA256, Value: sum[:]},
					MimeType: "image/jpeg",
					Size:     int64(len(body)),
				},
				Width:  int32(w),
				Height: int32(h),
			})
		}
		c.images = append(c.images, set)
	}
}

// renderJPEG draws a deterministic abstract image (gradient plus circles)
// that compresses like a photo rather than like noise or a flat fill.
func renderJPEG(seed, w, h int) []byte {
	r := rand.New(rand.NewPCG(uint64(seed)+7, 99))
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	c1 := [3]float64{r.Float64() * 255, r.Float64() * 255, r.Float64() * 255}
	c2 := [3]float64{r.Float64() * 255, r.Float64() * 255, r.Float64() * 255}
	type circle struct {
		x, y, rad float64
		col       [3]float64
	}
	var circles []circle
	for i := 0; i < 6; i++ {
		circles = append(circles, circle{r.Float64() * float64(w), r.Float64() * float64(h), (0.05 + r.Float64()*0.2) * float64(w),
			[3]float64{r.Float64() * 255, r.Float64() * 255, r.Float64() * 255}})
	}
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			t := (float64(x)/float64(w) + float64(y)/float64(h)) / 2
			px := [3]float64{}
			for k := 0; k < 3; k++ {
				px[k] = c1[k]*(1-t) + c2[k]*t
			}
			for _, c := range circles {
				d := math.Hypot(float64(x)-c.x, float64(y)-c.y)
				if d < c.rad {
					a := 0.6 * (1 - d/c.rad)
					for k := 0; k < 3; k++ {
						px[k] = px[k]*(1-a) + c.col[k]*a
					}
				}
			}
			// Mild grain so the encoder has texture to spend bytes on.
			g := (r.Float64() - 0.5) * 18
			img.SetRGBA(x, y, color.RGBA{clamp(px[0] + g), clamp(px[1] + g), clamp(px[2] + g), 255})
		}
	}
	var buf bytes.Buffer
	_ = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 80})
	return buf.Bytes()
}

func clamp(v float64) uint8 {
	if v < 0 {
		return 0
	}
	if v > 255 {
		return 255
	}
	return uint8(v)
}

// Mention formats an in-text mention the way the composer rewrites them.
func Mention(identity, name string) string {
	return "@{" + identity + "," + name + "}"
}

// ShortID abbreviates an identity for logs.
func ShortID(identity string) string {
	if len(identity) > 10 {
		return identity[:10]
	}
	return identity
}
