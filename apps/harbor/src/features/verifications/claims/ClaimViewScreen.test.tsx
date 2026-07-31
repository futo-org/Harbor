jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: {
      palette: new Proxy({}, { get: () => '#000' }),
      atoms: new Proxy({}, { get: () => ({}) }),
    },
  }),
  Atoms: new Proxy({}, { get: () => ({}) }),
}));

// Rendered Button props by title — `fireEvent.press` fires the composite's
// `onPress` even when the mock drops it, so tests assert `disabled` directly.
let mockButtonProps: Record<string, { disabled?: boolean }> = {};
jest.mock('@/src/common/components', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    Text: ({ children }: { children?: unknown }) =>
      react.createElement(Text, null, children),
    Button: ({
      title,
      onPress,
      disabled,
    }: {
      title: string;
      onPress?: () => void;
      disabled?: boolean;
    }) => {
      mockButtonProps[title] = { disabled };
      return react.createElement(
        Text,
        { onPress: disabled ? undefined : onPress },
        title,
      );
    },
  };
});

jest.mock('@/src/common/components/Icon', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/src/common/components/layout', () => {
  const react = require('react');
  const Screen = ({ children }: { children?: unknown }) =>
    react.createElement(react.Fragment, null, children);
  Screen.PrimaryColumn = ({ children }: { children?: unknown }) =>
    react.createElement(react.Fragment, null, children);
  return { Screen };
});

jest.mock('@/src/common/components/layout/Topbar', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/src/common/components/ScrollView', () => {
  const react = require('react');
  const { View } = require('react-native');
  return {
    ScrollView: ({ children }: { children?: unknown }) =>
      react.createElement(View, null, children),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
}));

let mockIdentityKey = 'me';
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  useCurrentIdentity: () => ({ identityKey: mockIdentityKey }),
}));

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/src/common/components/toast', () => ({
  useToast: () => mockToast,
}));

const mockVerify = jest.fn(async () => undefined);
jest.mock('../hooks/useVerifyClaim', () => ({
  __esModule: true,
  default: () => ({ verify: mockVerify, isPending: false }),
}));

jest.mock('../hooks/useRequestPlatformVerification', () => ({
  __esModule: true,
  default: () => ({ isPending: false, submit: jest.fn(async () => undefined) }),
}));

jest.mock('../hooks/useClaimById', () => ({
  useClaimById: () => ({
    claim: {
      id: 'aabb',
      schemaName: 'Freeform',
      fields: [],
      identity: 'me',
      keyFingerprint: 'fp',
      sequence: 1n,
      createdAt: 0n,
    },
    isLoading: false,
  }),
}));

jest.mock('../utils/render', () => ({
  resolveClaimTitle: () => ({ title: 'My claim', bodyFields: [] }),
}));

jest.mock('./ClaimMenu', () => ({ ClaimMenu: () => null }));
jest.mock('./toolbar', () => ({ Toolbar: () => null }));

jest.mock('./toolbar/StatusChip', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    StatusChip: ({
      verifiedCount = 0,
      totalCount = 0,
    }: {
      verifiedCount?: number;
      totalCount?: number;
    }) =>
      react.createElement(
        Text,
        { testID: 'status-chip' },
        totalCount > 0
          ? `${verifiedCount}/${totalCount} verified`
          : 'Not verified',
      ),
  };
});

jest.mock('./ClaimVerifiersList', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    ClaimVerifiersList: ({
      verifiers,
    }: {
      verifiers: { identity: string; verified: boolean }[];
    }) =>
      react.createElement(
        Text,
        { testID: 'verifiers' },
        verifiers.map((v) => v.identity).join(','),
      ),
  };
});

type VerifiersResult = {
  verifiers: { identity: string; verified: boolean }[];
  verifiedCount: number;
  totalCount: number;
  isLoading: boolean;
  refresh: () => void;
};
const emptyVerifiers = (): VerifiersResult => ({
  verifiers: [],
  verifiedCount: 0,
  totalCount: 0,
  isLoading: false,
  refresh: () => {},
});
let mockVerifiers: VerifiersResult = emptyVerifiers();
jest.mock('../hooks/useClaimVerifiers', () => ({
  useClaimVerifiers: () => mockVerifiers,
}));

type SheetProps = { open: boolean; onClose: () => void };
let mockSheetProps: SheetProps | null = null;
jest.mock('../RequestVerificationSheet', () => ({
  RequestVerificationSheet: (props: SheetProps) => {
    mockSheetProps = props;
    return null;
  },
}));

import { fireEvent, render } from '@testing-library/react-native';
import * as React from 'react';
import ClaimViewScreen from './ClaimViewScreen';

beforeEach(() => {
  mockSheetProps = null;
  mockVerifiers = emptyVerifiers();
  mockParams = { identityId: 'me', keyFingerprint: 'fp', sequence: '1' };
  mockIdentityKey = 'me';
  mockButtonProps = {};
  mockVerify.mockClear();
});

describe('ClaimViewScreen', () => {
  it('opens the request sheet when arriving from the create flow', async () => {
    mockParams.requestVerification = '1';
    await render(<ClaimViewScreen />);

    expect(mockSheetProps?.open).toBe(true);
  });

  it('keeps the request sheet closed otherwise', async () => {
    await render(<ClaimViewScreen />);

    expect(mockSheetProps?.open).toBe(false);
  });

  it('opens the request sheet from the button', async () => {
    const screen = await render(<ClaimViewScreen />);
    expect(mockSheetProps?.open).toBe(false);

    await fireEvent.press(screen.getByText('Request verification'));

    expect(mockSheetProps?.open).toBe(true);
  });

  it('shows Not verified when there are no verifications', async () => {
    mockVerifiers = {
      ...emptyVerifiers(),
      verifiers: [{ identity: 'bob', verified: false }],
      totalCount: 1,
    };
    const screen = await render(<ClaimViewScreen />);

    expect(screen.getByTestId('status-chip')).toHaveTextContent('0/1 verified');
    expect(screen.getByTestId('verifiers')).toHaveTextContent('bob');
  });

  it('shows the verified ratio once someone verifies', async () => {
    mockVerifiers = {
      verifiers: [
        { identity: 'bob', verified: true },
        { identity: 'carol', verified: false },
      ],
      verifiedCount: 1,
      totalCount: 2,
      isLoading: false,
      refresh: () => {},
    };
    const screen = await render(<ClaimViewScreen />);

    expect(screen.getByTestId('status-chip')).toHaveTextContent('1/2 verified');
  });

  it('hides every action button from a viewer who was not asked to verify', async () => {
    mockIdentityKey = 'viewer';
    const screen = await render(<ClaimViewScreen />);

    expect(screen.queryByText('Request verification')).toBeNull();
    expect(screen.queryByText('Verify this claim')).toBeNull();
    expect(screen.queryByText('Verified')).toBeNull();
  });

  it('lets a requested viewer verify the claim', async () => {
    mockIdentityKey = 'viewer';
    mockVerifiers = {
      ...emptyVerifiers(),
      verifiers: [{ identity: 'viewer', verified: false }],
      totalCount: 1,
    };
    const screen = await render(<ClaimViewScreen />);

    expect(screen.queryByText('Request verification')).toBeNull();
    await fireEvent.press(screen.getByText('Verify this claim'));

    expect(mockVerify).toHaveBeenCalledWith({ claimId: 'aabb' });
  });

  it('disables the button once the viewer has verified', async () => {
    mockIdentityKey = 'viewer';
    mockVerifiers = {
      ...emptyVerifiers(),
      verifiers: [{ identity: 'viewer', verified: true }],
      verifiedCount: 1,
      totalCount: 1,
    };
    const screen = await render(<ClaimViewScreen />);

    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.queryByText('Verify this claim')).toBeNull();
    expect(mockButtonProps['Verified']).toEqual({ disabled: true });
  });

  it('shows the author the request button, never the verify button', async () => {
    // Even when the author appears in the verifiers list.
    mockVerifiers = {
      ...emptyVerifiers(),
      verifiers: [{ identity: 'me', verified: false }],
      totalCount: 1,
    };
    const screen = await render(<ClaimViewScreen />);

    expect(screen.getByText('Request verification')).toBeTruthy();
    expect(screen.queryByText('Verify this claim')).toBeNull();
  });
});
