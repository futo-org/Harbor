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

jest.mock('@/src/common/components', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    Text: ({ children }: { children?: unknown }) =>
      react.createElement(Text, null, children),
  };
});

jest.mock('@/src/common/components/Icon', () => ({
  __esModule: true,
  default: () => null,
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
      data: { key: string }[];
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
                { key: item.key },
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

function claim(sequence: number, identity = 'profile-id'): DecodedClaim {
  return {
    id: `id-${sequence}`,
    schemaName: 'Freeform',
    fields: [],
    identity,
    keyFingerprint: 'fp',
    sequence: BigInt(sequence),
    createdAt: 0n,
  };
}

let mockClaims: DecodedClaim[] = [];
let mockLoading = false;

jest.mock('@/src/features/verifications/hooks/useClaimsList', () => ({
  useClaimsList: () => ({
    claims: mockClaims,
    isLoading: mockLoading,
    isRefreshing: false,
    refresh: jest.fn(),
  }),
}));

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

jest.mock('@/src/features/verifications/claims/ClaimActionRow', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    ClaimActionRow: ({ title }: { title: string }) =>
      react.createElement(Text, { testID: 'request-row' }, title),
  };
});

type SheetProps = { open: boolean; requestFrom?: string };
let mockSheetProps: SheetProps | null = null;
jest.mock(
  '@/src/features/verifications/claims/create/ClaimCreateSheet',
  () => ({
    ClaimCreateSheet: (props: SheetProps) => {
      mockSheetProps = props;
      return null;
    },
  }),
);

import { render } from '@testing-library/react-native';
import { ProfileVerificationsList } from './ProfileVerificationsList';

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSelf = false;
  mockClaims = [];
  mockLoading = false;
  mockSheetProps = null;
});

describe('ProfileVerificationsList on another profile', () => {
  it('leads with the request row', async () => {
    const screen = await render(<ProfileVerificationsList />);

    expect(screen.getByTestId('request-row')).toHaveTextContent(
      /Request a verification/,
    );
  });

  it('shows a skeleton while loading', async () => {
    mockLoading = true;
    const screen = await render(<ProfileVerificationsList />);

    expect(screen.getByTestId('claim-skeleton')).toBeTruthy();
    expect(screen.queryByText('No claims yet.')).toBeNull();
  });

  it('lists every claim', async () => {
    mockClaims = [claim(1), claim(2), claim(3), claim(4), claim(5)];
    const screen = await render(<ProfileVerificationsList />);

    expect(screen.getAllByTestId(/^claim-/)).toHaveLength(5);
  });
});

describe('ProfileVerificationsList on the own profile', () => {
  beforeEach(() => {
    mockIsSelf = true;
  });

  it('has no request row and no request sheet', async () => {
    const screen = await render(<ProfileVerificationsList />);

    expect(screen.queryByTestId('request-row')).toBeNull();
    expect(mockSheetProps).toBeNull();
  });
});
