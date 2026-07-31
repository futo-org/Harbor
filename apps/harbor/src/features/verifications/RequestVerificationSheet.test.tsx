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
  const { View } = require('react-native');
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
  Sheet.Header = () => null;
  Sheet.Content = ({ children }: { children?: unknown }) =>
    react.createElement(View, null, children);
  return { Sheet };
});

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/src/common/components/toast', () => ({
  useToast: () => mockToast,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  useCurrentIdentity: () => ({ identityKey: 'me' }),
}));

type SearchProps = {
  onSelect: (identity: string) => void;
  exclude?: readonly string[];
  pendingIdentity?: string | null;
};
let mockSearchProps: SearchProps | null = null;
jest.mock('@/src/features/profile/search', () => ({
  ProfileSearchInput: (props: SearchProps) => {
    mockSearchProps = props;
    return null;
  },
}));

const mockRequestSubmit = jest.fn(async () => undefined);
jest.mock('./hooks/useRequestVerification', () => ({
  __esModule: true,
  default: () => ({ isPending: false, submit: mockRequestSubmit }),
}));

import { act, render } from '@testing-library/react-native';
import * as React from 'react';
import { RequestVerificationSheet } from './RequestVerificationSheet';

const onClose = jest.fn();

function renderSheet() {
  return render(
    <RequestVerificationSheet open onClose={onClose} claimId="aabb" />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchProps = null;
});

describe('RequestVerificationSheet', () => {
  it('excludes the current identity from suggestions', async () => {
    await renderSheet();
    expect(mockSearchProps?.exclude).toEqual(['me']);
  });

  it('requests verification from the selected identity and closes', async () => {
    await renderSheet();

    await act(async () => mockSearchProps!.onSelect('them'));

    expect(mockRequestSubmit).toHaveBeenCalledWith({
      claimId: 'aabb',
      identity: 'them',
    });
    expect(mockToast.success).toHaveBeenCalledWith('Verification requested');
    expect(onClose).toHaveBeenCalled();
  });

  it('marks the selected row pending while the request is in flight', async () => {
    let resolveSubmit: () => void = () => {};
    mockRequestSubmit.mockReturnValueOnce(
      new Promise<undefined>((resolve) => {
        resolveSubmit = () => resolve(undefined);
      }),
    );
    await renderSheet();

    await act(async () => {
      mockSearchProps!.onSelect('them');
    });
    expect(mockSearchProps?.pendingIdentity).toBe('them');

    await act(async () => resolveSubmit());
    expect(mockSearchProps?.pendingIdentity).toBeNull();
  });

  it('stays open and shows an error when the request fails', async () => {
    mockRequestSubmit.mockRejectedValueOnce(new Error('offline'));
    await renderSheet();

    await act(async () => mockSearchProps!.onSelect('them'));

    expect(mockToast.error).toHaveBeenCalledWith('offline');
    expect(onClose).not.toHaveBeenCalled();
    expect(mockSearchProps?.pendingIdentity).toBeNull();
  });
});
