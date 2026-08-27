import {
  resolveImageSources,
  VIEWER_TARGET,
  type ImageViewerInput,
} from './resolveImageSources';

// `v2` is only used as types here and in the helpers; a stub keeps the
// real (native-backed) package out of the test.
jest.mock('@polycentric/react-native', () => ({ v2: {} }));

type BlobUrls = Parameters<typeof resolveImageSources>[1];

// Fake ImageSet variants use string digests so blobUrls results are easy
// to assert against.
const variant = (width: number, height: number, digest?: string) => ({
  width,
  height,
  ...(digest ? { blob: { digest } } : {}),
});

const imageSet = (
  ...variants: ReturnType<typeof variant>[]
): ImageViewerInput => ({ images: variants }) as unknown as ImageViewerInput;

const blobUrls: BlobUrls = (digest) => [`blob://${digest}`];

describe('resolveImageSources', () => {
  it('wraps plain-uri sources in a single-candidate list', () => {
    const plain = { uri: 'https://example.com/identicon.png' };
    expect(resolveImageSources([plain], blobUrls)).toEqual([
      { uris: ['https://example.com/identicon.png'], aspectRatio: undefined },
    ]);
  });

  it('keeps an explicit aspect ratio on plain sources', () => {
    const plain = { uri: 'https://example.com/banner.png', aspectRatio: 3 };
    expect(resolveImageSources([plain], blobUrls)).toEqual([
      { uris: ['https://example.com/banner.png'], aspectRatio: 3 },
    ]);
  });

  it('resolves an ImageSet to the smallest variant at or above the target', () => {
    const set = imageSet(
      variant(512, 256, 'small'),
      variant(VIEWER_TARGET, 1024, 'fit'),
      variant(4096, 2048, 'huge'),
    );
    expect(resolveImageSources([set], blobUrls)).toEqual([
      { uris: ['blob://fit'], aspectRatio: 2 },
    ]);
  });

  it('falls back to the largest variant when none reach the target', () => {
    const set = imageSet(variant(512, 512, 'small'), variant(1024, 512, 'big'));
    expect(resolveImageSources([set], blobUrls)).toEqual([
      { uris: ['blob://big'], aspectRatio: 2 },
    ]);
  });

  it('keeps one candidate uri per server', () => {
    const set = imageSet(variant(2048, 1024, 'x'));
    const multi: BlobUrls = (digest) => [`a://${digest}`, `b://${digest}`];
    expect(resolveImageSources([set], multi)).toEqual([
      { uris: ['a://x', 'b://x'], aspectRatio: 2 },
    ]);
  });

  it('defaults zero dimensions instead of dividing by zero', () => {
    const set = imageSet(variant(0, 0, 'broken'));
    expect(resolveImageSources([set], blobUrls)).toEqual([
      { uris: ['blob://broken'], aspectRatio: 1 },
    ]);
  });

  it('drops a set whose chosen variant has no digest', () => {
    expect(
      resolveImageSources([imageSet(variant(2048, 1024))], blobUrls),
    ).toEqual([]);
  });

  it('drops a set when no server can serve it', () => {
    const set = imageSet(variant(2048, 1024, 'x'));
    expect(resolveImageSources([set], () => [])).toEqual([]);
  });

  it('drops empty image sets', () => {
    expect(resolveImageSources([imageSet()], blobUrls)).toEqual([]);
  });

  it('preserves order across mixed inputs and skips unresolvable ones', () => {
    const sources = resolveImageSources(
      [
        { uri: 'plain://first' },
        imageSet(variant(2048, 2048, 'second')),
        imageSet(), // unresolvable
        { uri: 'plain://third', aspectRatio: 0.5 },
      ],
      blobUrls,
    );
    expect(sources.map((s) => s.uris[0])).toEqual([
      'plain://first',
      'blob://second',
      'plain://third',
    ]);
  });
});
