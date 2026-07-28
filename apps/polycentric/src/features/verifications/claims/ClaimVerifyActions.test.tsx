jest.mock('@expo/vector-icons', () => ({ FontAwesome6: () => null }));
jest.mock('@/src/common/theme', () => ({
  Atoms: new Proxy({}, { get: () => ({}) }),
}));

// Rendered Button props by title — `fireEvent.press` fires the composite's
// `onPress` even when the mock drops it, so tests assert `disabled` directly.
let mockButtonProps: Record<string, { disabled?: boolean }> = {};
jest.mock('@/src/common/components', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
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

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/src/common/components/toast', () => ({
  useToast: () => mockToast,
}));

let mockIdentityKey = 'me';
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  useCurrentIdentity: () => ({ identityKey: mockIdentityKey }),
}));

const mockVerify = jest.fn(async () => undefined);
jest.mock('../hooks/useVerifyClaim', () => ({
  __esModule: true,
  default: () => ({ verify: mockVerify, isPending: false }),
}));

const mockPlatformSubmit = jest.fn(async (): Promise<void> => undefined);
let mockPlatformPending = false;
jest.mock('../hooks/useRequestPlatformVerification', () => ({
  __esModule: true,
  default: () => ({
    isPending: mockPlatformPending,
    submit: mockPlatformSubmit,
  }),
}));

type SheetProps = { open: boolean; onClose: () => void; claimId: string };
let mockSheetProps: SheetProps | null = null;
jest.mock('../RequestVerificationSheet', () => ({
  RequestVerificationSheet: (props: SheetProps) => {
    mockSheetProps = props;
    return null;
  },
}));

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import type { DecodedClaim } from '../hooks/useClaimById';
import { ClaimVerifyActions } from './ClaimVerifyActions';

function claimOf(
  schemaName: string,
  fields: { key: string; value: string }[],
): DecodedClaim {
  return {
    id: 'aabb',
    schemaName,
    fields: fields.map((f) => ({ ...f, label: f.key })),
    identity: 'me',
    keyFingerprint: 'fp',
    sequence: 1n,
    createdAt: 0n,
  };
}

const PLATFORM_CLAIM = claimOf('Platform', [
  { key: 'platform', value: 'youtube' },
  { key: 'account', value: '@futo' },
]);
const FREEFORM_CLAIM = claimOf('Freeform', [{ key: 'name', value: 'X' }]);

beforeEach(() => {
  mockIdentityKey = 'me';
  mockButtonProps = {};
  mockSheetProps = null;
  mockPlatformPending = false;
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockVerify.mockClear();
  mockPlatformSubmit.mockReset();
  mockPlatformSubmit.mockResolvedValue(undefined);
});

describe('author of a platform claim', () => {
  it('verifies through the platform and toasts on success', async () => {
    const screen = await render(
      <ClaimVerifyActions claim={PLATFORM_CLAIM} verifiers={[]} />,
    );

    await fireEvent.press(screen.getByText('Verify with YouTube'));

    expect(mockPlatformSubmit).toHaveBeenCalledWith({
      platform: expect.objectContaining({ slug: 'youtube' }),
      claimId: 'aabb',
    });
    await waitFor(() => expect(mockToast.success).toHaveBeenCalled());
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('toasts the error message on failure', async () => {
    mockPlatformSubmit.mockRejectedValue(new Error('Unable to find token'));
    const screen = await render(
      <ClaimVerifyActions claim={PLATFORM_CLAIM} verifiers={[]} />,
    );

    await fireEvent.press(screen.getByText('Verify with YouTube'));

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Unable to find token'),
    );
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('disables the button while verifying', async () => {
    mockPlatformPending = true;
    const screen = await render(
      <ClaimVerifyActions claim={PLATFORM_CLAIM} verifiers={[]} />,
    );

    expect(screen.getByText('Verifying…')).toBeTruthy();
    expect(mockButtonProps['Verifying…']).toEqual({ disabled: true });
  });

  it('hides the identity picker for platform claims', async () => {
    const screen = await render(
      <ClaimVerifyActions claim={PLATFORM_CLAIM} verifiers={[]} />,
    );

    expect(screen.queryByText('Request verification')).toBeNull();
    expect(mockSheetProps).toBeNull();
  });

  it('falls back to the identity picker for unknown platforms', async () => {
    const claim = claimOf('Platform', [
      { key: 'platform', value: 'myspace' },
      { key: 'account', value: 'tom' },
    ]);
    const screen = await render(
      <ClaimVerifyActions claim={claim} verifiers={[]} />,
    );

    expect(screen.getByText('Request verification')).toBeTruthy();
  });
});

describe('author of a non-platform claim', () => {
  it('opens the request sheet from the button', async () => {
    const screen = await render(
      <ClaimVerifyActions claim={FREEFORM_CLAIM} verifiers={[]} />,
    );
    expect(mockSheetProps?.open).toBe(false);

    await fireEvent.press(screen.getByText('Request verification'));

    expect(mockSheetProps?.open).toBe(true);
    expect(mockSheetProps?.claimId).toBe('aabb');
  });

  it('opens the sheet immediately with requestOnOpen', async () => {
    await render(
      <ClaimVerifyActions
        claim={FREEFORM_CLAIM}
        verifiers={[]}
        requestOnOpen
      />,
    );

    expect(mockSheetProps?.open).toBe(true);
  });
});

describe('viewer', () => {
  beforeEach(() => {
    mockIdentityKey = 'viewer';
  });

  it('shows nothing without a verification request', async () => {
    const screen = await render(
      <ClaimVerifyActions claim={FREEFORM_CLAIM} verifiers={[]} />,
    );

    expect(screen.queryByText('Request verification')).toBeNull();
    expect(screen.queryByText('Verify this claim')).toBeNull();
  });

  it('lets a requested viewer verify the claim', async () => {
    const screen = await render(
      <ClaimVerifyActions
        claim={FREEFORM_CLAIM}
        verifiers={[{ identity: 'viewer', verified: false }]}
      />,
    );

    await fireEvent.press(screen.getByText('Verify this claim'));

    expect(mockVerify).toHaveBeenCalledWith({ claimId: 'aabb' });
  });

  it('disables the button once verified', async () => {
    const screen = await render(
      <ClaimVerifyActions
        claim={FREEFORM_CLAIM}
        verifiers={[{ identity: 'viewer', verified: true }]}
      />,
    );

    expect(screen.getByText('Verified')).toBeTruthy();
    expect(mockButtonProps['Verified']).toEqual({ disabled: true });
  });

  it('never shows the platform verify button to a viewer', async () => {
    const screen = await render(
      <ClaimVerifyActions claim={PLATFORM_CLAIM} verifiers={[]} />,
    );

    expect(screen.queryByText('Verify with YouTube')).toBeNull();
  });
});
