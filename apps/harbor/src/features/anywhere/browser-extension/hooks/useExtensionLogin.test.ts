import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  LOGIN_CANCEL_MESSAGE,
  LOGIN_READY_MESSAGE,
  LOGIN_REQUEST_MESSAGE,
  LOGIN_SESSION_MESSAGE,
} from '../../lib/login-messages';
import { useExtensionLogin } from './useExtensionLogin';

const mockContext = {
  currentIdentity: undefined as unknown,
  isLoading: false,
  isReady: true,
};
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  usePolycentricContext: () => mockContext,
}));
jest.mock('@/src/common/util/platform', () => ({ isWeb: true }));
jest.mock('@/src/features/identity-pairing/pairingCode', () => ({
  extractPairingInfo: (code: string) =>
    code === 'valid' ? { server: 'https://server.example' } : undefined,
}));

const EXTENSION_ORIGIN = 'chrome-extension://abcdef';

/** The extension's page, which frames the app. */
const extension = { postMessage: jest.fn() };
type Listener = (event: Partial<MessageEvent>) => void;
let listeners: Listener[] = [];
const realWindow = { ...window };

beforeEach(() => {
  mockContext.currentIdentity = undefined;
  extension.postMessage.mockClear();
  listeners = [];
  Object.assign(window, {
    parent: extension,
    addEventListener: (_: string, listener: Listener) =>
      listeners.push(listener),
    removeEventListener: (_: string, listener: Listener) => {
      listeners = listeners.filter((l) => l !== listener);
    },
  });
});

afterAll(() => {
  Object.assign(window, realWindow);
});

function renderHook(pageUrl = 'https://example.com/a') {
  const result = {
    current: null as never as ReturnType<typeof useExtensionLogin>,
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  function Probe({ pageUrl }: { pageUrl: string }) {
    result.current = useExtensionLogin(pageUrl);
    return null;
  }
  act(() => {
    renderer = TestRenderer.create(React.createElement(Probe, { pageUrl }));
  });
  const setPageUrl = (pageUrl: string) => {
    act(() => {
      renderer.update(React.createElement(Probe, { pageUrl }));
    });
  };
  return { result, setPageUrl };
}

/** A message as the extension would post it, unless told otherwise. */
function receive(
  data: unknown,
  { source = extension as unknown, origin = EXTENSION_ORIGIN } = {},
) {
  act(() => {
    for (const listener of listeners) {
      listener({ data, source: source as MessageEventSource, origin });
    }
  });
}

const session = { type: LOGIN_SESSION_MESSAGE, code: 'valid' };

describe('useExtensionLogin', () => {
  it('asks to be signed in when signed out, again on each page', () => {
    const { setPageUrl } = renderHook();
    expect(extension.postMessage).toHaveBeenCalledWith(
      { type: LOGIN_REQUEST_MESSAGE },
      '*',
    );

    setPageUrl('https://example.com/b');
    expect(extension.postMessage).toHaveBeenCalledTimes(2);
  });

  it('asks again once the Harbor tab has loaded', () => {
    renderHook();
    receive({ type: LOGIN_READY_MESSAGE });
    expect(extension.postMessage).toHaveBeenCalledTimes(2);
    expect(extension.postMessage).toHaveBeenLastCalledWith(
      { type: LOGIN_REQUEST_MESSAGE },
      '*',
    );
  });

  it('does not ask when signed in', () => {
    mockContext.currentIdentity = {};
    const { result } = renderHook();
    expect(extension.postMessage).not.toHaveBeenCalled();

    receive(session);
    expect(result.current.session).toBeUndefined();
  });

  it('takes the session the extension passes on', () => {
    const { result } = renderHook();
    receive(session);
    expect(result.current.session).toEqual({
      server: 'https://server.example',
    });
  });

  it('ignores a session that is not from the extension', () => {
    const { result } = renderHook();
    receive(session, { origin: 'https://evil.example' });
    receive(session, { source: {} });
    receive({ type: LOGIN_SESSION_MESSAGE, code: 'not a pairing code' });
    expect(result.current.session).toBeUndefined();
  });

  it('drops the session when the tab cancels or the user does', () => {
    const { result } = renderHook();
    receive(session);
    receive({ type: LOGIN_CANCEL_MESSAGE });
    expect(result.current.session).toBeUndefined();

    receive(session);
    act(() => result.current.cancel());
    expect(result.current.session).toBeUndefined();
    // The tab is told, so it stops offering to approve the dropped key.
    expect(extension.postMessage).toHaveBeenLastCalledWith(
      { type: LOGIN_CANCEL_MESSAGE },
      '*',
    );
  });
});
