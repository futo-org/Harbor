jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: { palette: new Proxy({}, { get: () => '#000' }) },
  }),
  Atoms: new Proxy({}, { get: () => ({}) }),
  withHexOpacity: (color: string) => color,
}));

jest.mock('@/src/common/components', () => {
  const react = require('react');
  const rn = require('react-native');
  return {
    Text: ({ children, ...props }: { children?: unknown }) =>
      react.createElement(rn.Text, props, children),
    IconButton: ({
      icon,
      onPress,
    }: {
      icon?: () => unknown;
      onPress?: () => void;
    }) => react.createElement(rn.Pressable, { onPress }, icon?.()),
    TextInput: (props: object) => react.createElement(rn.TextInput, props),
  };
});

jest.mock('@/src/common/components/Icon', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) =>
      react.createElement(Text, { testID: `icon-${name}` }, name),
  };
});

jest.mock('@/src/common/components/sheet', () => {
  const react = require('react');
  const { View } = require('react-native');
  const Sheet = ({
    header,
    children,
  }: {
    header?: unknown;
    children?: unknown;
  }) => react.createElement(View, null, header, children);
  Sheet.Header = () => null;
  Sheet.Content = ({ children }: { children?: unknown }) =>
    react.createElement(View, null, children);
  return { Sheet };
});

const mockRouter = { canGoBack: jest.fn(() => true), back: jest.fn() };
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));

// The real hook reaches the polycentric client (native modules) through
// useQuery; none of these tests exercise the moderation affordances.
jest.mock('@/src/features/moderation/hooks/useModerationStatus', () => ({
  __esModule: true,
  default: () => ({
    isLoading: false,
    moderatedServers: [] as string[],
    isModerator: false,
  }),
}));

// The only authorization check in the servers settings screen is used to
// gate the editing actions.
// We will mock it to always be authorized unless changed.
let mockCanRotate = true;
jest.mock('@/src/common/lib/polycentric-hooks/useCurrentAuthorization', () => ({
  useCurrentAuthorization: () => ({
    canRotate: mockCanRotate,
    canSign: mockCanRotate,
    refresh: () => {},
  }),
}));

const mockHook = {
  servers: [] as string[],
  suggestedServers: [] as string[],
  isBusy: false,
  addError: null as Error | null,
  addServer: jest.fn(async (_url: string) => true),
  removeServer: jest.fn(async (_server: string) => undefined),
};
jest.mock('./useServerSettings', () => ({
  useServerSettings: () => mockHook,
}));

import { fireEvent, render } from '@testing-library/react-native';
import * as React from 'react';
import ServersSettingsScreen from './ServersSettingsScreen';

async function renderScreen() {
  return await render(<ServersSettingsScreen />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanRotate = true;
  mockHook.servers = [];
  mockHook.suggestedServers = [];
  mockHook.isBusy = false;
  mockHook.addError = null;
  mockHook.addServer.mockResolvedValue(true);
});

describe('server list', () => {
  it('shows the empty state when no servers are configured', async () => {
    const screen = await renderScreen();
    expect(screen.getByText('No servers configured')).toBeTruthy();
  });

  it('renders a row per server and removes the pressed one', async () => {
    mockHook.servers = ['https://one.example', 'https://two.example'];
    const screen = await renderScreen();

    expect(screen.queryByText('No servers configured')).toBeNull();
    expect(screen.getByText('https://one.example')).toBeTruthy();

    await fireEvent.press(screen.getAllByTestId('icon-remove')[1]);
    expect(mockHook.removeServer).toHaveBeenCalledWith('https://two.example');
  });
});

describe('rotation gate', () => {
  it('hides every editing affordance for a non-rotation key', async () => {
    mockCanRotate = false;
    mockHook.servers = ['https://one.example'];
    mockHook.suggestedServers = ['https://seed.example'];
    const screen = await renderScreen();

    expect(screen.getByText('https://one.example')).toBeTruthy();
    expect(screen.queryByTestId('icon-remove')).toBeNull();
    expect(screen.queryByTestId('icon-addOutline')).toBeNull();
    expect(
      screen.queryByPlaceholderText('https://server.example.com'),
    ).toBeNull();

    await fireEvent.press(screen.getByText('https://seed.example'));
    expect(mockHook.addServer).not.toHaveBeenCalled();
  });
});

describe('suggested servers', () => {
  it('is hidden when there are no suggestions', async () => {
    const screen = await renderScreen();
    expect(screen.queryByText('Suggested servers')).toBeNull();
  });

  it('adds a suggestion when its row is pressed', async () => {
    mockHook.suggestedServers = ['https://seed.example'];
    const screen = await renderScreen();

    expect(screen.getByText('Suggested servers')).toBeTruthy();
    await fireEvent.press(screen.getByText('https://seed.example'));
    expect(mockHook.addServer).toHaveBeenCalledWith('https://seed.example');
  });
});

describe('add server form', () => {
  const input = (screen: Awaited<ReturnType<typeof renderScreen>>) =>
    screen.getByPlaceholderText('https://server.example.com');

  it('submits the trimmed url and clears the input on success', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(input(screen), '  https://new.example  ');
    await fireEvent.press(screen.getByTestId('icon-addOutline'));

    expect(mockHook.addServer).toHaveBeenCalledWith('https://new.example');
    expect(input(screen).props.value).toBe('');
  });

  it('keeps the input when the add fails', async () => {
    mockHook.addServer.mockResolvedValueOnce(false);
    const screen = await renderScreen();

    await fireEvent.changeText(input(screen), 'https://new.example');
    await fireEvent.press(screen.getByTestId('icon-addOutline'));

    expect(input(screen).props.value).toBe('https://new.example');
  });

  it('shows a spinner instead of the add button while busy', async () => {
    mockHook.isBusy = true;
    const screen = await renderScreen();

    expect(screen.getByLabelText('Adding server')).toBeTruthy();
    expect(screen.queryByTestId('icon-addOutline')).toBeNull();
  });

  it('shows the add error and toggles its logs', async () => {
    mockHook.addError = new Error('offline');
    mockHook.addError.stack = 'stack-trace';
    const screen = await renderScreen();

    expect(screen.queryByText('stack-trace')).toBeNull();
    await fireEvent.press(screen.getByText(/Could not add server\./));
    expect(screen.getByText('stack-trace')).toBeTruthy();

    await fireEvent.press(screen.getByText(/Could not add server\./));
    expect(screen.queryByText('stack-trace')).toBeNull();
  });
});
