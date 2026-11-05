import { render, waitFor } from '@testing-library/react-native';

const IDENTITY =
  'f00df0262908a197391c4cbc619eb11cb6867c90915b6e23a3db7a061def8fc3';
const ALIAS = 'test@domain.com';

// --- collaborators, all mocked so we exercise only the routing/verification ---

jest.mock('@polycentric/react-native', () => ({
  FetchMode: { Default: 'Default' },
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
  useFocusEffect: () => undefined,
  useIsFocused: () => true,
  useNavigation: () => ({ dispatch: jest.fn() }),
}));

jest.mock('./hooks/useProfile', () => ({ useProfile: jest.fn() }));
// The hook has its own tests; here it only decides routing.
jest.mock('./hooks/useIdentityHandle', () => ({
  useIdentityHandle: jest.fn(),
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
jest.mock('./ProfileVerifiesList', () => ({
  ProfileVerifiesList: () => null,
}));
jest.mock('@/src/features/feed/hooks/useIdentityFeed', () => ({
  useIdentityFeed: () => ({ refresh: () => undefined }),
}));
jest.mock('../block/hooks/useBlocks', () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) =>
    selector({ isBlocked: () => false }),
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
import { useLocalSearchParams } from 'expo-router';
import { useAliasResolutionStore } from './alias/useAliasResolutionStore';
import {
  type IdentityHandleResult,
  useIdentityHandle,
} from './hooks/useIdentityHandle';
import { useProfile } from './hooks/useProfile';

const mockResolve = jest.fn();
const mockParams = useLocalSearchParams as jest.Mock;

// What `useIdentityHandle` returns for each identity this test.
let handleByIdentity: Record<string, IdentityHandleResult> = {};

beforeEach(() => {
  jest.clearAllMocks();
  handleByIdentity = {};
  (useProfile as jest.Mock).mockReturnValue({});
  (useIdentityHandle as jest.Mock).mockImplementation(
    (identity: string | null | undefined) =>
      (identity && handleByIdentity[identity]) ?? {
        kind: 'loading',
        text: '…',
      },
  );
  // A request that never settles unless a test says otherwise.
  mockResolve.mockReturnValue(new Promise(() => undefined));
  useAliasResolutionStore.setState({
    identityByAlias: {},
    identityPromiseByAlias: {},
    resolveAlias: mockResolve,
  });
});

// `alias` settles in the store as `identity`, like a finished request.
function resolveAliasTo(alias: string, identity: string | null) {
  mockResolve.mockImplementation(async () => {
    useAliasResolutionStore.setState((state) => ({
      identityByAlias: { ...state.identityByAlias, [alias]: identity },
    }));
    return identity;
  });
}

describe('AliasProfile (alias path)', () => {
  beforeEach(() => mockParams.mockReturnValue({ identityId: ALIAS }));

  it('renders the profile when the candidate verifies the alias', async () => {
    resolveAliasTo(ALIAS, IDENTITY);
    handleByIdentity[IDENTITY] = { kind: 'alias', text: ALIAS };

    const { getByTestId } = await render(<ProfileScreen />);

    await waitFor(() => expect(getByTestId('profile')).toBeTruthy());
    const node = getByTestId('profile');
    expect(node.props.identityKey).toBe(IDENTITY);
    expect(node.props.alias).toBe(ALIAS);
  });

  it('renders an already resolved alias on the first frame', async () => {
    useAliasResolutionStore.setState({
      identityByAlias: { [ALIAS]: IDENTITY },
    });
    handleByIdentity[IDENTITY] = { kind: 'alias', text: ALIAS };

    const { getByTestId } = await render(<ProfileScreen />);

    expect(getByTestId('profile').props.identityKey).toBe(IDENTITY);
  });

  it('shows "Verifying" while the alias resolves', async () => {
    const { getByText } = await render(<ProfileScreen />);
    expect(getByText(/Verifying/)).toBeTruthy();
    expect(mockResolve).toHaveBeenCalledWith(ALIAS);
  });

  it('shows "Verifying" while the candidate profile loads', async () => {
    resolveAliasTo(ALIAS, IDENTITY);
    const { getByText } = await render(<ProfileScreen />);
    await waitFor(() => expect(getByText(/Verifying/)).toBeTruthy());
  });

  it.each<IdentityHandleResult>([
    { kind: 'alias', text: 'someone@else.com' },
    { kind: 'alias-pending', text: 'someone@else.com' },
    { kind: 'hash', text: IDENTITY.slice(0, 10) },
  ])('shows "Couldn\'t verify" when the candidate is %o', async (handle) => {
    resolveAliasTo(ALIAS, IDENTITY);
    handleByIdentity[IDENTITY] = handle;

    const { getByText } = await render(<ProfileScreen />);

    await waitFor(() => expect(getByText(/Couldn't verify/)).toBeTruthy());
  });

  it('shows "Couldn\'t verify" when the alias resolves to nothing', async () => {
    resolveAliasTo(ALIAS, null);
    const { getByText } = await render(<ProfileScreen />);
    await waitFor(() => expect(getByText(/Couldn't verify/)).toBeTruthy());
  });

  it('shows "Couldn\'t verify" for a malformed alias', async () => {
    mockParams.mockReturnValue({ identityId: 'not-an-alias' });
    const { getByText } = await render(<ProfileScreen />);
    expect(getByText(/Couldn't verify/)).toBeTruthy();
  });
});

describe('identity path', () => {
  it('renders the profile without an alias, whatever the handle', async () => {
    mockParams.mockReturnValue({ identityId: IDENTITY });
    handleByIdentity[IDENTITY] = { kind: 'alias', text: ALIAS };

    const { getByTestId } = await render(<ProfileScreen />);

    const node = getByTestId('profile');
    expect(node.props.identityKey).toBe(IDENTITY);
    expect(node.props.alias).toBeNull();
  });
});
