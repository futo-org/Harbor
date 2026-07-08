jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: {
      palette: new Proxy({}, { get: () => '#000' }),
      atoms: new Proxy({}, { get: () => ({}) }),
    },
  }),
  Atoms: new Proxy({}, { get: () => ({}) }),
  Spacing: new Proxy({}, { get: () => 8 }),
  withHexOpacity: (color: string) => color,
}));

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
    }) =>
      react.createElement(
        Text,
        { onPress: disabled ? undefined : onPress },
        title,
      ),
  };
});

jest.mock('@/src/common/components/Icon', () => ({
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

jest.mock('@/src/common/components/sheet', () => {
  const react = require('react');
  const { Text, View } = require('react-native');
  const Sheet = ({
    open,
    header,
    children,
  }: {
    open?: boolean;
    header?: unknown;
    children?: unknown;
  }) =>
    open === false ? null : react.createElement(View, null, header, children);
  Sheet.Header = ({
    title,
    onClose,
  }: {
    title?: string;
    onClose: () => void;
  }) =>
    react.createElement(
      View,
      null,
      react.createElement(Text, { testID: 'sheet-title' }, title),
      react.createElement(
        Text,
        { testID: 'sheet-back', onPress: onClose },
        '<',
      ),
    );
  Sheet.Content = ({ children }: { children?: unknown }) =>
    react.createElement(View, null, children);
  return { Sheet };
});

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/src/common/components/toast', () => ({
  useToast: () => mockToast,
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chain: Record<string, unknown> = {};
  chain.duration = () => chain;
  chain.delay = () => chain;
  return { __esModule: true, default: { View }, FadeInDown: chain };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  useCurrentIdentity: () => ({ identityKey: 'me' }),
}));

import type { DecodedClaim } from '../hooks/useClaimById';

const EXISTING_CLAIM: DecodedClaim = {
  id: 'aabb',
  schemaName: 'Freeform',
  fields: [],
  identity: 'me',
  keyFingerprint: 'fp',
  sequence: 7n,
  createdAt: 0n,
};

jest.mock('../hooks/useClaimsList', () => ({
  useClaimsList: () => ({
    claims: [EXISTING_CLAIM],
    isLoading: false,
    refresh: jest.fn(),
  }),
}));

const mockRequestSubmit = jest.fn(async () => undefined);
jest.mock('../hooks/useRequestVerification', () => ({
  __esModule: true,
  default: () => ({ isPending: false, submit: mockRequestSubmit }),
}));

jest.mock('../hooks/useCreateClaim', () => ({
  __esModule: true,
  default: undefined,
}));

type FormProps = {
  onSubmitted: (ref: {
    identity: string;
    keyFingerprint: string;
    sequence: string;
  }) => void;
};
let mockFormProps: FormProps | null = null;
jest.mock('./ClaimCreateForm', () => ({
  ClaimCreateForm: (props: FormProps) => {
    mockFormProps = props;
    return null;
  },
}));

jest.mock('./ClaimCreatePlatformPicker', () => ({
  ClaimCreatePlatformPicker: () => null,
}));
jest.mock('./ClaimCreatePlatformLink', () => ({
  ClaimCreatePlatformLink: () => null,
}));

jest.mock('./ClaimListItem', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    ClaimListItem: ({
      claim,
      onPress,
    }: {
      claim: DecodedClaim;
      onPress?: () => void;
    }) =>
      react.createElement(
        Text,
        { testID: `claim-${claim.sequence}`, onPress },
        claim.schemaName,
      ),
  };
});

import { act, fireEvent, render } from '@testing-library/react-native';
import * as React from 'react';
import { ClaimCreateSheet } from './ClaimCreateSheet';

const onClose = jest.fn();

function renderSheet(requestFrom?: string) {
  // RNTL v14 render is async.
  return render(
    <ClaimCreateSheet open onClose={onClose} requestFrom={requestFrom} />,
  );
}

const CLAIM_REF = { identity: 'me', keyFingerprint: 'fp', sequence: '1' };

beforeEach(() => {
  jest.clearAllMocks();
  mockFormProps = null;
});

describe('ClaimCreateSheet without a verifier', () => {
  it('starts at the claim type step', async () => {
    const screen = await renderSheet();
    expect(screen.getByTestId('sheet-title')).toHaveTextContent(
      'Create a claim',
    );
  });

  it('navigates to the claim view with the share prompt after creating', async () => {
    const screen = await renderSheet();
    await fireEvent.press(screen.getByText('Occupation'));
    expect(screen.getByTestId('sheet-title')).toHaveTextContent('Occupation');

    await act(async () => mockFormProps!.onSubmitted(CLAIM_REF));

    expect(mockToast.success).toHaveBeenCalledWith('Claim created');
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(
      '/me/verifications/fp/1?requestVerification=1',
    );
  });
});

describe('ClaimCreateSheet with a verifier', () => {
  it('starts at the new/existing chooser', async () => {
    const screen = await renderSheet('them');
    expect(screen.getByTestId('sheet-title')).toHaveTextContent(
      'Request a verification',
    );
    expect(screen.getByText('New claim')).toBeTruthy();
    expect(screen.getByText('Existing claim')).toBeTruthy();
  });

  it('requests verification of an existing claim without navigating', async () => {
    const screen = await renderSheet('them');
    await fireEvent.press(screen.getByText('Existing claim'));
    expect(screen.getByTestId('sheet-title')).toHaveTextContent(
      'Choose a claim',
    );

    await fireEvent.press(screen.getByTestId('claim-7'));

    expect(mockRequestSubmit).toHaveBeenCalledWith({
      claimId: 'aabb',
      identity: 'them',
    });
    expect(mockToast.success).toHaveBeenCalledWith('Verification requested');
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('creates a new claim without navigating', async () => {
    const screen = await renderSheet('them');
    await fireEvent.press(screen.getByText('New claim'));
    await fireEvent.press(screen.getByText('Occupation'));

    await act(async () => mockFormProps!.onSubmitted(CLAIM_REF));

    expect(mockToast.success).toHaveBeenCalledWith(
      'Claim created — verification requested',
    );
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('stays open and shows an error when the request fails', async () => {
    mockRequestSubmit.mockRejectedValueOnce(new Error('offline'));
    const screen = await renderSheet('them');
    await fireEvent.press(screen.getByText('Existing claim'));

    await fireEvent.press(screen.getByTestId('claim-7'));

    expect(mockToast.error).toHaveBeenCalledWith('offline');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('back retraces the steps, then closes', async () => {
    const screen = await renderSheet('them');
    await fireEvent.press(screen.getByText('Existing claim'));
    expect(screen.getByTestId('sheet-title')).toHaveTextContent(
      'Choose a claim',
    );

    await fireEvent.press(screen.getByTestId('sheet-back'));
    expect(screen.getByTestId('sheet-title')).toHaveTextContent(
      'Request a verification',
    );

    await fireEvent.press(screen.getByTestId('sheet-back'));
    expect(onClose).toHaveBeenCalled();
  });
});
