// parseImageIndex is pure, but its module mounts a screen — stub the
// screen's dependencies so importing it stays cheap.
jest.mock('expo-router', () => ({
  router: {},
  Redirect: () => null,
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/src/common/components/ImageViewer', () => ({
  ImageViewerScreen: () => null,
}));
jest.mock('@/src/common/constants/routes', () => ({ Routes: { tabs: {} } }));
jest.mock('@/src/common/lib/polycentric-hooks/helpers', () => ({
  getKeyFingerprint: () => undefined,
}));
jest.mock('@/src/common/lib/navigation/openWithReturn', () => ({
  openWithReturn: () => undefined,
}));
jest.mock('@/src/features/composer/hooks/useComposer', () => ({
  MAX_ATTACHMENTS: 4,
}));
jest.mock('./hooks/usePostById', () => ({ usePostById: () => ({}) }));

import { parseImageIndex } from './PostImageViewerScreen';

describe('parseImageIndex', () => {
  it('maps the 1-based URL param to a 0-based index', () => {
    expect(parseImageIndex('1', 4)).toBe(0);
    expect(parseImageIndex('4', 4)).toBe(3);
  });

  it('clamps out-of-range values into the list', () => {
    expect(parseImageIndex('0', 4)).toBe(0);
    expect(parseImageIndex('-2', 4)).toBe(0);
    expect(parseImageIndex('9', 4)).toBe(3);
  });

  it('falls back to the first image on junk', () => {
    expect(parseImageIndex('banana', 4)).toBe(0);
    expect(parseImageIndex('', 4)).toBe(0);
  });

  it('handles an empty image list', () => {
    expect(parseImageIndex('3', 0)).toBe(0);
  });
});
