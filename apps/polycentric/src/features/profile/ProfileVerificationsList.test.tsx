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

// Renders every row so the section composition is observable.
jest.mock('@/src/common/components/List', () => {
  const react = require('react');
  const { Text, View } = require('react-native');
  return {
    List: ({
      data,
      renderItem,
    }: {
      data: { key: string }[];
      renderItem: (info: { item: unknown; index: number }) => unknown;
    }) =>
      react.createElement(
        View,
        null,
        data.map((item, index) =>
          react.createElement(
            View,
            { key: item.key },
            renderItem({ item, index }),
          ),
        ),
      ),
    SectionHeader: ({ title }: { title: string }) =>
      react.createElement(Text, null, title),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  useUsername: () => 'alice',
  truncateName: (name: string) => name,
}));

jest.mock('./hooks/useProfile', () => ({
  useProfile: () => ({ name: 'Alice' }),
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

let mockRequested: DecodedClaim[] = [];
let mockVerified: DecodedClaim[] = [];
let mockPending: DecodedClaim[] = [];
let mockPendingArg: string | undefined;

jest.mock('@/src/features/verifications/hooks/useClaimsList', () => ({
  useClaimsList: () => ({
    claims: mockRequested,
    isLoading: false,
    refresh: jest.fn(),
  }),
}));
jest.mock('@/src/features/verifications/hooks/useVerifiedClaims', () => ({
  useVerifiedClaims: () => ({
    claims: mockVerified,
    isLoading: false,
    refresh: jest.fn(),
  }),
}));
jest.mock(
  '@/src/features/verifications/hooks/useVerificationRequestsTo',
  () => ({
    useVerificationRequestsTo: (identity: string | undefined) => {
      mockPendingArg = identity;
      return { claims: mockPending, isLoading: false, refresh: jest.fn() };
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

jest.mock('@/src/features/verifications/claims/ClaimActionRow', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    ClaimActionRow: ({
      title,
      subtitle,
    }: {
      title: string;
      subtitle?: string;
    }) =>
      react.createElement(
        Text,
        { testID: 'request-row' },
        `${title} ${subtitle ?? ''}`,
      ),
  };
});

type SheetProps = { open: boolean; requestFrom?: string };
let mockSheetProps: SheetProps | null = null;
jest.mock('@/src/features/verifications/claims/ClaimCreateSheet', () => ({
  ClaimCreateSheet: (props: SheetProps) => {
    mockSheetProps = props;
    return null;
  },
}));

import { fireEvent, render } from '@testing-library/react-native';
import * as React from 'react';
import { ProfileVerificationsList } from './ProfileVerificationsList';

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSelf = false;
  mockRequested = [];
  mockVerified = [];
  mockPending = [];
  mockPendingArg = undefined;
  mockSheetProps = null;
});

describe('ProfileVerificationsList on another profile', () => {
  it('leads with the request row naming the profile', async () => {
    const screen = await render(<ProfileVerificationsList />);

    const row = screen.getByTestId('request-row');
    expect(row).toHaveTextContent(/Request a verification/);
    expect(row).toHaveTextContent(/Alice can verify/);
  });

  it('shows pending requests in the verified section', async () => {
    mockPending = [claim(9, 'me')];
    const screen = await render(<ProfileVerificationsList />);

    expect(screen.getByTestId('claim-9')).toBeTruthy();
    expect(screen.queryByText('No verified claims yet.')).toBeNull();
  });

  it('previews three claims and expands with show more', async () => {
    mockRequested = [claim(1), claim(2), claim(3), claim(4), claim(5)];
    const screen = await render(<ProfileVerificationsList />);

    expect(screen.getAllByTestId(/^claim-/)).toHaveLength(3);

    await fireEvent.press(screen.getByText('Show more'));

    expect(screen.getAllByTestId(/^claim-/)).toHaveLength(5);
    expect(screen.queryByText('Show more')).toBeNull();
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

  it('does not query for pending requests', async () => {
    await render(<ProfileVerificationsList />);

    expect(mockPendingArg).toBeUndefined();
  });
});
