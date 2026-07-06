import { render } from '@testing-library/react-native';

const IDENTITY =
  'f00df0262908a197391c4cbc619eb11cb6867c90915b6e23a3db7a061def8fc3';

// Context value the header reads; set per test.
let mockContext: {
  identityKey: string | null;
  isSelf: boolean;
  activeFeed: string;
  setActiveFeed: () => void;
  alias: string | null;
};

jest.mock('./ProfileContext', () => ({
  useProfileContext: () => mockContext,
}));

jest.mock('./hooks/useProfile', () => ({
  useProfile: () => ({
    name: 'Alice',
    description: null,
    avatar: null,
    banner: null,
    alias: null,
    isLoading: false,
    error: null,
    refresh: () => undefined,
  }),
}));

jest.mock('@polycentric/react-native', () => ({ FetchMode: { Default: 'd' } }));
jest.mock('@rn-primitives/portal', () => ({
  Portal: ({ children }: { children: unknown }) => children,
}));
jest.mock('@/src/common/components/HoverCard', () => {
  const HoverCard = ({ children }: { children: unknown }) => children;
  HoverCard.Trigger = ({ children }: { children: unknown }) => children;
  // Closed by default under test, so the full-alias copy isn't also rendered.
  HoverCard.Content = () => null;
  return { __esModule: true, default: HoverCard };
});
jest.mock('@/src/common/components/Icon', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../follow/FollowButton', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/src/common/components/composites', () => ({
  BackButton: () => null,
}));
jest.mock('@/src/common/components/ImageViewer', () => ({
  useImageViewer: () => () => undefined,
}));
jest.mock('@/src/common/components/primitives', () => {
  const react = require('react');
  const { Text: Native } = require('react-native');
  return {
    Text: ({ children }: { children: unknown }) =>
      react.createElement(Native, null, children),
    Button: () => null,
    ProfileAvatar: () => null,
  };
});
jest.mock('@/src/common/constants', () => ({
  Routes: { tabs: { editProfile: () => '/x' } },
}));
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  identiconUrl: () => 'u',
  shortenIdentityId: () => 'SHORT_ID',
  truncateName: (name: string) => name,
  useUsername: () => 'fallback',
}));
jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({ theme: { palette: { neutral_0: '#fff' } } }),
  Atoms: new Proxy({}, { get: () => ({}) }),
}));

import { ProfileHeader } from './ProfileHeader';

const baseContext = {
  identityKey: IDENTITY,
  isSelf: false,
  activeFeed: 'posts',
  setActiveFeed: () => undefined,
  alias: null as string | null,
};

describe('ProfileHeader alias', () => {
  it('shows the alias under the id when present in context', async () => {
    mockContext = { ...baseContext, alias: 'test@domain.com' };
    const { queryByText } = await render(
      <ProfileHeader bannerColors={['#a', '#b']} onBack={() => undefined} />,
    );
    expect(queryByText('test@domain.com')).not.toBeNull();
    expect(queryByText('SHORT_ID')).not.toBeNull();
  });

  it('shows only the id when there is no alias', async () => {
    mockContext = { ...baseContext, alias: null };
    const { queryByText } = await render(
      <ProfileHeader bannerColors={['#a', '#b']} onBack={() => undefined} />,
    );
    expect(queryByText('SHORT_ID')).not.toBeNull();
    // No alias-style text rendered.
    expect(queryByText(/@/)).toBeNull();
  });
});
