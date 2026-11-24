let mockIsWeb = true;
jest.mock('@/src/common/util/platform', () => ({
  get isWeb() {
    return mockIsWeb;
  },
}));

jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: {
      atoms: new Proxy({}, { get: () => new Proxy({}, { get: () => ({}) }) }),
    },
  }),
  Atoms: new Proxy({}, { get: () => ({}) }),
}));

// Plain RN Texts; the link stand-in exposes its href.
jest.mock('@/src/common/components/primitives', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    ProfileAvatar: () => null,
    Text: (props: { children?: unknown }) =>
      react.createElement(Text, null, props.children),
    InlineLink: (props: { href: string; children?: unknown }) =>
      react.createElement(Text, { href: props.href }, props.children),
  };
});
jest.mock('@/src/common/components/TimeAgo', () => ({ TimeAgo: () => '5m' }));
jest.mock('@/src/common/lib/navigation/eventRoute', () => ({
  eventRoute: () => '/alice-id/post/1',
}));
jest.mock('@/src/common/lib/navigation/useCardLinkPress', () => ({
  useCardLinkPress: () => ({}),
}));
jest.mock('./hooks/usePostModeration', () => ({
  usePostModeration: () => ({ hasWarnContent: false, warnLabels: [] }),
}));
jest.mock('./content/PostContent', () => ({ PostContent: () => null }));
jest.mock('./PostAuthor', () => ({ PostAuthor: () => null }));
jest.mock('./PostHeader', () => ({ PostHeader: () => null }));
jest.mock('./PostMenu', () => ({ __esModule: true, default: () => null }));
jest.mock('./toolbar/PostToolbar', () => ({ PostToolbar: () => null }));
jest.mock('./PostWarnOverlay', () => ({ PostWarnOverlay: () => null }));
jest.mock('@polycentric/react-native-sdk', () => ({ COLLECTION: { FEED: 1 } }));

import { render } from '@testing-library/react-native';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { Post } from './Post';

const post = { identity: 'alice-id', createdAt: 1 } as unknown as PostData;

beforeEach(() => {
  mockIsWeb = true;
});

test('on web, the timestamp links to the post', async () => {
  const screen = await render(<Post post={post} />);

  expect(screen.getByText('5m').props.href).toBe('/alice-id/post/1');
});

test('on native, only the card links to the post', async () => {
  mockIsWeb = false;
  const screen = await render(<Post post={post} />);

  expect(screen.getByText('5m').props.href).toBeUndefined();
});
