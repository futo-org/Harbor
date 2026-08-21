jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: {
      palette: new Proxy({}, { get: () => '#000' }),
      atoms: new Proxy({}, { get: () => ({}) }),
    },
  }),
  Atoms: new Proxy({}, { get: () => ({}) }),
  Spacing: new Proxy({}, { get: () => 8 }),
}));

// Renders the header, rows, and empty state so composition is observable.
jest.mock('@/src/common/components/List', () => {
  const react = require('react');
  const { View } = require('react-native');
  return {
    List: ({
      data,
      renderItem,
      ListHeaderComponent,
      ListEmptyComponent,
    }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => unknown;
      ListHeaderComponent?: unknown;
      ListEmptyComponent?: unknown;
    }) =>
      react.createElement(
        View,
        null,
        ListHeaderComponent,
        data.length === 0
          ? ListEmptyComponent
          : data.map((item, index) =>
              react.createElement(
                View,
                { key: String(index) },
                renderItem({ item, index }),
              ),
            ),
      ),
  };
});

jest.mock('@/src/common/components/ListEmpty', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    ListEmpty: ({ children }: { children?: unknown }) =>
      react.createElement(Text, null, children),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let mockIsSelf = false;
jest.mock('./ProfileContext', () => ({
  useProfileContext: () => ({ identityKey: 'profile-id', isSelf: mockIsSelf }),
}));

import type { DecodedClaim } from '@/src/features/verifications/hooks/useClaimById';
import type { ClaimWithStatus } from '@/src/features/verifications/utils/claim-status';

function claim(
  sequence: number,
  verifiers: { identity: string; verified: boolean }[],
): ClaimWithStatus {
  return {
    id: `id-${sequence}`,
    schemaName: 'Freeform',
    fields: [],
    identity: 'owner',
    keyFingerprint: 'fp',
    sequence: BigInt(sequence),
    createdAt: 0n,
    status: {
      verifiers,
      verifiedCount: verifiers.filter((row) => row.verified).length,
      totalCount: verifiers.length,
    },
  };
}

let mockRequested: ClaimWithStatus[] = [];
let mockRequestedEnabled: boolean | undefined;
jest.mock(
  '@/src/features/verifications/hooks/useRequestedVerifications',
  () => ({
    useRequestedVerifications: (_identity: string, enabled: boolean) => {
      mockRequestedEnabled = enabled;
      return {
        claims: enabled ? mockRequested : [],
        isLoading: false,
        isRefreshing: false,
        refresh: jest.fn(),
      };
    },
  }),
);

jest.mock('@/src/features/verifications/claims/ClaimListItem', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    ClaimListItem: ({ claim: item }: { claim: DecodedClaim }) =>
      react.createElement(
        Text,
        { testID: `claim-${item.sequence}` },
        item.schemaName,
      ),
  };
});

jest.mock('@/src/features/verifications/claims/ClaimSkeleton', () => {
  const react = require('react');
  const { View } = require('react-native');
  return {
    ClaimSkeletonList: () =>
      react.createElement(View, { testID: 'claim-skeleton' }),
  };
});

import { render } from '@testing-library/react-native';
import { ProfileVerifiesList } from './ProfileVerifiesList';

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSelf = false;
  mockRequested = [];
  mockRequestedEnabled = undefined;
});

describe('ProfileVerifiesList', () => {
  it('lists the requested claims the profile verified', async () => {
    mockRequested = [
      claim(1, [{ identity: 'profile-id', verified: true }]),
      claim(2, [{ identity: 'profile-id', verified: false }]),
      claim(3, [{ identity: 'someone-else', verified: true }]),
    ];

    const screen = await render(<ProfileVerifiesList />);

    expect(screen.getAllByTestId(/^claim-/)).toHaveLength(1);
    expect(screen.getByTestId('claim-1')).toBeTruthy();
  });

  it('only loads when active', async () => {
    await render(<ProfileVerifiesList active={false} />);

    expect(mockRequestedEnabled).toBe(false);
  });

  it('shows the empty state once loaded', async () => {
    const screen = await render(<ProfileVerifiesList />);

    expect(screen.getByText('No vouches yet.')).toBeTruthy();
  });

  it('stands as a skeleton while inactive instead of an empty state', async () => {
    const screen = await render(<ProfileVerifiesList active={false} />);

    expect(screen.queryByText('No vouches yet.')).toBeNull();
  });
});
