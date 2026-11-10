import {
  DEFAULT_ASPECT_RATIO,
  MAX_ASPECT_RATIO,
  MIN_ASPECT_RATIO,
  singleImageAspectRatio,
} from './attachmentLayout';

describe('singleImageAspectRatio', () => {
  it('returns the natural ratio for an image within range', () => {
    // 3:2 landscape sits between the 3/4 and 16/9 bounds.
    expect(singleImageAspectRatio({ width: 1500, height: 1000 })).toBeCloseTo(
      1.5,
    );
  });

  it('returns a square ratio unchanged', () => {
    expect(singleImageAspectRatio({ width: 800, height: 800 })).toBe(1);
  });

  it('clamps very wide panoramas to the max ratio', () => {
    expect(singleImageAspectRatio({ width: 4000, height: 1000 })).toBe(
      MAX_ASPECT_RATIO,
    );
  });

  it('clamps very tall portraits to the min ratio', () => {
    expect(singleImageAspectRatio({ width: 1000, height: 4000 })).toBe(
      MIN_ASPECT_RATIO,
    );
  });

  it('keeps a ratio exactly on a bound', () => {
    expect(singleImageAspectRatio({ width: 16, height: 9 })).toBe(
      MAX_ASPECT_RATIO,
    );
    expect(singleImageAspectRatio({ width: 9, height: 16 })).toBe(
      MIN_ASPECT_RATIO,
    );
  });

  it('leaves phone portrait photos at their natural ratio', () => {
    // 3:4 from a camera, 9:16 from a screenshot.
    expect(singleImageAspectRatio({ width: 3024, height: 4032 })).toBeCloseTo(
      0.75,
    );
    expect(singleImageAspectRatio({ width: 1080, height: 1920 })).toBeCloseTo(
      0.5625,
    );
  });

  it('falls back to the default when dimensions are missing or zero', () => {
    expect(singleImageAspectRatio({})).toBe(DEFAULT_ASPECT_RATIO);
    expect(singleImageAspectRatio({ width: 0, height: 0 })).toBe(
      DEFAULT_ASPECT_RATIO,
    );
    expect(singleImageAspectRatio({ width: 100, height: 0 })).toBe(
      DEFAULT_ASPECT_RATIO,
    );
  });
});
