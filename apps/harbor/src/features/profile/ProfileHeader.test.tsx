import { fireEvent, render } from '@testing-library/react-native';

const IDENTITY =
  'f00df0262908a197391c4cbc619eb11cb6867c90915b6e23a3db7a061def8fc3';

// Context value the header reads; set per test.
let mockContext: {
  identityKey: string | null;
  isSelf: boolean;
  activeFeed: string;
  setActiveFeed: () => void;
};

jest.mock('@/src/features/follow/FollowingBadge', () => ({
  __esModule: true,
  FollowingBadge: () => null,
}));

jest.mock('./ProfileContext', () => ({
  useProfileContext: () => mockContext,
}));

// The hook has its own tests; set per test.
let mockHandle: { kind: string; text: string };
jest.mock('./hooks/useIdentityHandle', () => ({
  useIdentityHandle: () => mockHandle,
}));

let mockCounts = { followingCount: 0, followersCount: 0 };
jest.mock('./hooks/useProfile', () => ({
  useProfile: () => ({
    name: 'Alice',
    description: null,
    avatar: null,
    banner: null,
    alias: null,
    ...mockCounts,
    labels: [],
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
jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../follow/FollowButton', () => ({
  __esModule: true,
  default: () => null,
}));
// ProfileMenu pulls in @rn-primitives/dropdown-menu, whose dist ships
// untranspiled JSX that jest-expo does not transform.
jest.mock('./ProfileMenu', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('./ProfileShareSheet', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('./ProfileVerifiedPlatforms', () => ({
  ProfileVerifiedPlatforms: () => null,
}));
jest.mock('@/src/common/components/composites', () => ({
  BackButton: () => null,
}));
jest.mock('@/src/features/profile/ProfilePhotoScreen', () => ({
  openProfilePhoto: () => undefined,
}));
jest.mock('@/src/common/components/primitives', () => {
  const react = require('react');
  const { Text: Native } = require('react-native');
  return {
    AVATAR_SIZE_MAP: { xl: 0 },
    Text: ({ children }: { children: unknown }) =>
      react.createElement(Native, null, children),
    Button: () => null,
    IconButton: () => null,
    ProfileAvatar: () => null,
  };
});
jest.mock('@/src/common/constants', () => ({
  Routes: {
    tabs: {
      editProfile: () => '/x',
      profileIdentity: () => '/x/identity',
      profileFollowing: () => '/x/following',
      profileFollowers: () => '/x/followers',
    },
  },
}));
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  identiconUrl: () => 'u',
  truncateName: (name: string) => name,
  useUsername: () => 'Alice',
}));
jest.mock('@/src/common/theme', () => ({
  ...jest.requireActual('@/src/common/theme'),
  useTheme: () => ({ theme: { palette: { neutral_0: '#fff' } } }),
  Atoms: new Proxy({}, { get: () => ({}) }),
}));

import { router } from 'expo-router';
import type { SharedValue } from 'react-native-reanimated';
import { ProfileHeader } from './ProfileHeader';

const scrollY = { value: 0 } as SharedValue<number>;

const baseContext = {
  identityKey: IDENTITY,
  isSelf: false,
  activeFeed: 'posts',
  setActiveFeed: () => undefined,
};

beforeEach(() => {
  mockContext = { ...baseContext };
  mockHandle = { kind: 'hash', text: IDENTITY.slice(0, 10) };
});

describe('ProfileHeader alias', () => {
  it.each(['alias', 'alias-pending'])(
    'shows a %s under the id',
    async (kind) => {
      mockHandle = { kind, text: 'test@domain.com' };
      const { queryByText } = await render(
        <ProfileHeader
          bannerColors={['#a', '#b']}
          onBack={() => undefined}
          scrollY={scrollY}
        />,
      );
      expect(queryByText('test@domain.com')).not.toBeNull();
      expect(queryByText(IDENTITY)).not.toBeNull();
    },
  );

  it('shows only the id without an alias', async () => {
    const { queryByText } = await render(
      <ProfileHeader
        bannerColors={['#a', '#b']}
        onBack={() => undefined}
        scrollY={scrollY}
      />,
    );
    expect(queryByText(IDENTITY)).not.toBeNull();
    // No alias-style text rendered.
    expect(queryByText(/@/)).toBeNull();
  });
});

describe('ProfileHeader identity key', () => {
  beforeEach(() => {
    mockContext = { ...baseContext };
    (router.navigate as jest.Mock).mockClear();
  });

  it('opens the identity sheet when the key is pressed', async () => {
    const { getByText } = await render(
      <ProfileHeader
        bannerColors={['#a', '#b']}
        onBack={() => undefined}
        scrollY={scrollY}
      />,
    );

    await fireEvent.press(getByText(IDENTITY));
    expect(router.navigate).toHaveBeenCalledWith('/x/identity');
  });
});

describe('ProfileHeader follow counters', () => {
  beforeEach(() => {
    mockContext = { ...baseContext };
    mockCounts = { followingCount: 0, followersCount: 0 };
    (router.navigate as jest.Mock).mockClear();
  });

  it('renders the counts from the profile', async () => {
    mockCounts = { followingCount: 3, followersCount: 7 };
    const { getByText } = await render(
      <ProfileHeader
        bannerColors={['#a', '#b']}
        onBack={() => undefined}
        scrollY={scrollY}
      />,
    );

    expect(getByText('3')).toBeTruthy();
    expect(getByText(/Following/)).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
    expect(getByText(/Followers/)).toBeTruthy();
  });

  it('links to the following and followers lists', async () => {
    const { getByText } = await render(
      <ProfileHeader
        bannerColors={['#a', '#b']}
        onBack={() => undefined}
        scrollY={scrollY}
      />,
    );

    await fireEvent.press(getByText(/Following/));
    expect(router.navigate).toHaveBeenCalledWith('/x/following');

    await fireEvent.press(getByText(/Followers/));
    expect(router.navigate).toHaveBeenCalledWith('/x/followers');
  });
});
