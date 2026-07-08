jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: {
      palette: new Proxy({}, { get: () => '#000' }),
      atoms: new Proxy({}, { get: () => ({}) }),
    },
  }),
  Atoms: new Proxy({}, { get: () => ({}) }),
}));

jest.mock('@/src/common/components', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    Text: ({ children }: { children?: unknown }) =>
      react.createElement(Text, null, children),
    Button: ({ title, onPress }: { title: string; onPress?: () => void }) =>
      react.createElement(Text, { onPress }, title),
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
  mockParams = { identityId: 'me', keyFingerprint: 'fp', sequence: '1' };
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
});
