import { render, waitFor } from '@testing-library/react-native';

const IDENTITY =
  'f00df0262908a197391c4cbc619eb11cb6867c90915b6e23a3db7a061def8fc3';
const OTHER_IDENTITY =
  '0a2abecb223dbd572729018f8d201f32471e2a5b71e2032c052f6830846c4722';
const ALIAS = 'test@domain.com';

// --- collaborators, all mocked so we exercise only the routing/verification ---

jest.mock('@polycentric/react-native', () => ({
  FetchMode: { Default: 'Default' },
  resolveAlias: jest.fn(),
  isIdentityKey: (s: string): boolean =>
    s.length > 0 && [...s].every((c) => '0123456789abcdefABCDEF'.includes(c)),
  normalizeAlias: (alias: string): string | null => {
    let s = alias.trim();
    if (s.startsWith('@')) s = s.slice(1);
    const at = s.indexOf('@');
    if (at <= 0 || s.indexOf('@', at + 1) !== -1) return null;
    return s.toLowerCase();
  },
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
  useFocusEffect: () => undefined,
  useIsFocused: () => true,
  useNavigation: () => ({ dispatch: jest.fn() }),
}));

jest.mock('./hooks/useProfile', () => ({ useProfile: jest.fn() }));

jest.mock('./lib/aliasVerificationCache', () => ({
  getVerifiedIdentity: jest.fn(),
  getVerifiedAlias: jest.fn(),
  recordVerifiedAlias: jest.fn(),
}));

// Stub ProfileProvider to a leaf that surfaces its props (and does NOT render
// children, so the feed-heavy ProfileScreenContent never mounts under test).
jest.mock('./ProfileContext', () => {
  const react = require('react');
  const { View } = require('react-native');
  return {
    ProfileProvider: ({
      identityKey,
      alias,
    }: {
      identityKey: string | null;
      alias?: string | null;
    }) =>
      react.createElement(View, {
        testID: 'profile',
        identityKey,
        alias: alias ?? null,
      }),
    useProfileContext: () => ({}),
  };
});

// Inert stubs for the module-level imports the screen pulls in.
jest.mock('./ProfileHeader', () => ({ ProfileHeader: () => null }));
jest.mock('./ProfileCompactHeader', () => ({
  ProfileCompactHeader: () => null,
}));
jest.mock('./ProfileTabs', () => ({ ProfileTabs: () => null }));
// FlashList ships untranspiled ESM, so the pages' list stays out of this test.
jest.mock('@/src/features/feed/FeedList', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('./ProfileVerificationsList', () => ({
  ProfileVerificationsList: () => null,
}));
jest.mock('@/src/features/feed/hooks/useIdentityFeed', () => ({
  useIdentityFeed: () => ({ refresh: () => undefined }),
}));
jest.mock('@/src/common/lib/navigation/useFocusedRefresh', () => ({
  useFocusedRefresh: () => undefined,
}));
jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({ theme: { palette: { primary_500: '#000' } } }),
  Atoms: new Proxy({}, { get: () => ({}) }),
  Spacing: new Proxy({}, { get: () => 8 }),
  typography: { lineHeight: new Proxy({}, { get: () => 20 }) },
  ZIndex: { raised: 10 },
}));
jest.mock('@/src/common/components', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    Text: ({ children }: { children: unknown }) =>
      react.createElement(Text, null, children),
  };
});
jest.mock('@/src/common/components/layout', () => {
  const react = require('react');
  const Screen = ({ children }: { children: unknown }) =>
    react.createElement(react.Fragment, null, children);
  Screen.PrimaryColumn = ({ children }: { children: unknown }) =>
    react.createElement(react.Fragment, null, children);
  return { Screen };
});

import ProfileScreen from './ProfileScreen';
import { resolveAlias } from '@polycentric/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useProfile } from './hooks/useProfile';
import {
  getVerifiedAlias,
  getVerifiedIdentity,
  recordVerifiedAlias,
} from './lib/aliasVerificationCache';

const mockResolve = resolveAlias as jest.Mock;
const mockUseProfile = useProfile as jest.Mock;
const mockParams = useLocalSearchParams as jest.Mock;
const mockReplace = router.replace as jest.Mock;
const mockGetVerifiedIdentity = getVerifiedIdentity as jest.Mock;
const mockGetVerifiedAlias = getVerifiedAlias as jest.Mock;
const mockRecord = recordVerifiedAlias as jest.Mock;

const EMPTY_PROFILE = {
  name: null,
  description: null,
  avatar: null,
  banner: null,
  alias: null as string | null,
  isLoading: false,
  error: null,
  refresh: () => undefined,
};

// The profile useProfile should return for a non-null identity this test.
let profileResult = EMPTY_PROFILE;

beforeEach(() => {
  jest.clearAllMocks();
  profileResult = EMPTY_PROFILE;
  // Disabled (null id) yields the empty profile; a real id yields the fixture.
  mockUseProfile.mockImplementation((id: string | null) =>
    id ? profileResult : EMPTY_PROFILE,
  );
  mockGetVerifiedIdentity.mockReturnValue(null);
  mockGetVerifiedAlias.mockReturnValue(null);
});

describe('AliasProfile (alias path)', () => {
  beforeEach(() => mockParams.mockReturnValue({ identityId: ALIAS }));

  it('renders the profile when the identity claims the alias back', async () => {
    mockResolve.mockResolvedValue(IDENTITY);
    profileResult = { ...EMPTY_PROFILE, alias: ALIAS };

    const { getByTestId } = await render(<ProfileScreen />);

    await waitFor(() => expect(getByTestId('profile')).toBeTruthy());
    const node = getByTestId('profile');
    expect(node.props.identityKey).toBe(IDENTITY);
    expect(node.props.alias).toBe(ALIAS);
    expect(mockRecord).toHaveBeenCalledWith(ALIAS, IDENTITY);
  });

  it('shows "Couldn\'t verify" when the profile claims a different alias', async () => {
    mockResolve.mockResolvedValue(IDENTITY);
    profileResult = { ...EMPTY_PROFILE, alias: 'someone@else.com' };

    const { getByText } = await render(<ProfileScreen />);

    await waitFor(() => expect(getByText(/Couldn't verify/)).toBeTruthy());
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('shows "Couldn\'t find" when resolution fails', async () => {
    mockResolve.mockResolvedValue(null);
    const { getByText } = await render(<ProfileScreen />);
    await waitFor(() => expect(getByText(/Couldn't find/)).toBeTruthy());
  });

  it('stays on "Verifying" while the candidate profile loads', async () => {
    mockResolve.mockResolvedValue(IDENTITY);
    profileResult = { ...EMPTY_PROFILE, isLoading: true };
    const { getByText } = await render(<ProfileScreen />);
    await waitFor(() => expect(getByText(/Verifying/)).toBeTruthy());
  });

  it('short-circuits via the cache without hitting the network', async () => {
    mockGetVerifiedIdentity.mockReturnValue(IDENTITY);

    const { getByTestId } = await render(<ProfileScreen />);

    await waitFor(() => expect(getByTestId('profile')).toBeTruthy());
    expect(getByTestId('profile').props.identityKey).toBe(IDENTITY);
    expect(mockResolve).not.toHaveBeenCalled();
  });
});

describe('IdentityProfile (identity path)', () => {
  beforeEach(() => mockParams.mockReturnValue({ identityId: IDENTITY }));

  it('redirects to the alias URL when it resolves back to this identity', async () => {
    profileResult = { ...EMPTY_PROFILE, alias: ALIAS };
    mockResolve.mockResolvedValue(IDENTITY);

    await render(<ProfileScreen />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(`/${ALIAS}`));
    expect(mockRecord).toHaveBeenCalledWith(ALIAS, IDENTITY);
  });

  it('does not redirect when the alias points at a different identity', async () => {
    profileResult = { ...EMPTY_PROFILE, alias: ALIAS };
    mockResolve.mockResolvedValue(OTHER_IDENTITY);

    await render(<ProfileScreen />);

    await waitFor(() => expect(mockResolve).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('uses the cache fast-path to redirect without a network call', async () => {
    mockGetVerifiedAlias.mockReturnValue(ALIAS);

    await render(<ProfileScreen />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(`/${ALIAS}`));
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('does not redirect a profile with no alias', async () => {
    profileResult = EMPTY_PROFILE;
    await render(<ProfileScreen />);
    // Give effects a chance to run.
    await waitFor(() => expect(mockUseProfile).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockResolve).not.toHaveBeenCalled();
  });
});
