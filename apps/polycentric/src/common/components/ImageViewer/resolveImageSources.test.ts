import { resolveImageSources, VIEWER_TARGET } from './resolveImageSources';
import type { ImageViewerInput } from './useImageViewerStore';

// `v2` is only used as types here and in the helpers; a stub keeps the
// real (native-backed) package out of the test.
jest.mock('@polycentric/react-native', () => ({ v2: {} }));

type BlobUrl = Parameters<typeof resolveImageSources>[1];

// Fake ImageSet variants use string digests so blobUrl results are easy
// to assert against.
const variant = (width: number, height: number, digest?: string) => ({
  width,
  height,
  ...(digest ? { blob: { digest } } : {}),
});

const imageSet = (
  ...variants: ReturnType<typeof variant>[]
): ImageViewerInput => ({ images: variants }) as unknown as ImageViewerInput;

const blobUrl: BlobUrl = (digest) => `blob://${digest}`;

describe('resolveImageSources', () => {
  it('passes plain-uri sources through unchanged', () => {
    const plain = { uri: 'https://example.com/identicon.png' };
    expect(resolveImageSources([plain], blobUrl)).toEqual([plain]);
  });

  it('keeps an explicit aspect ratio on plain sources', () => {
    const plain = { uri: 'https://example.com/banner.png', aspectRatio: 3 };
    expect(resolveImageSources([plain], blobUrl)).toEqual([plain]);
  });

  it('resolves an ImageSet to the smallest variant at or above the target', () => {
    const set = imageSet(
      variant(512, 256, 'small'),
      variant(VIEWER_TARGET, 1024, 'fit'),
      variant(4096, 2048, 'huge'),
    );
    expect(resolveImageSources([set], blobUrl)).toEqual([
      { uri: 'blob://fit', aspectRatio: 2 },
    ]);
  });

  it('falls back to the largest variant when none reach the target', () => {
    const set = imageSet(variant(512, 512, 'small'), variant(1024, 512, 'big'));
    expect(resolveImageSources([set], blobUrl)).toEqual([
      { uri: 'blob://big', aspectRatio: 2 },
    ]);
  });

  it('defaults zero dimensions instead of dividing by zero', () => {
    const set = imageSet(variant(0, 0, 'broken'));
    expect(resolveImageSources([set], blobUrl)).toEqual([
      { uri: 'blob://broken', aspectRatio: 1 },
    ]);
  });

  it('drops a set whose chosen variant has no digest', () => {
    expect(
      resolveImageSources([imageSet(variant(2048, 1024))], blobUrl),
    ).toEqual([]);
  });

  it('drops a set when the blob CDN is not known yet', () => {
    const set = imageSet(variant(2048, 1024, 'x'));
    expect(resolveImageSources([set], () => null)).toEqual([]);
  });

  it('drops empty image sets', () => {
    expect(resolveImageSources([imageSet()], blobUrl)).toEqual([]);
  });

  it('preserves order across mixed inputs and skips unresolvable ones', () => {
    const sources = resolveImageSources(
      [
        { uri: 'plain://first' },
        imageSet(variant(2048, 2048, 'second')),
        imageSet(), // unresolvable
        { uri: 'plain://third', aspectRatio: 0.5 },
      ],
      blobUrl,
    );
    expect(sources.map((s) => s.uri)).toEqual([
      'plain://first',
      'blob://second',
      'plain://third',
    ]);
  });
});
