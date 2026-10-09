import { act, render } from '@testing-library/react-native';

// Identity the mocked client reports as active; tests reassign it.
let mockActiveIdentityKey: string | null = 'me';
const mockAcknowledgeNotifications = jest.fn(async () => {});
const mockInvalidateQuery = jest.fn();
// What the mocked useQuery returns; tests reassign it.
let mockQueryResult: { data: ArrayBuffer | undefined } = { data: undefined };
const mockUseQuery = jest.fn((..._args: unknown[]) => mockQueryResult);
const mockSetQueryCache = jest.fn();

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  usePolycentric: () => ({
    activeIdentityKey: mockActiveIdentityKey,
    acknowledgeNotifications: mockAcknowledgeNotifications,
    core: { invalidateQuery: mockInvalidateQuery },
  }),
}));

jest.mock('@/src/common/query/hooks/useQuery', () => ({
  setQueryCache: (...args: unknown[]) => mockSetQueryCache(...(args as [])),
  useQuery: (...args: unknown[]) => mockUseQuery(...(args as [])),
}));

// A one-byte stand-in for the proto codec: the count is the byte.
jest.mock('@polycentric/react-native', () => ({
  Query: {
    SubscribeUnreadNotificationCount: class SubscribeUnreadNotificationCount {},
  },
  v2: {
    SubscribeUnreadNotificationCountResponse: {
      toBinary: ({ count }: { count: number }) => new Uint8Array([count]),
      fromBinary: (bytes: Uint8Array) => ({ count: bytes[0] ?? 0 }),
    },
  },
}));

import useUnreadNotificationCount, {
  unreadNotificationsBadgeLabel,
  useAcknowledgeNotifications,
} from './useUnreadNotificationCount';

function countResponse(count: number): ArrayBuffer {
  return new Uint8Array([count]).buffer as ArrayBuffer;
}

// `renderHook` renders an empty result under this jest-expo setup, so run
// the hooks through a probe component like the other component tests do.
let count: number;
let acknowledge: () => Promise<void>;
function Probe({ enabled = true }: { enabled?: boolean }) {
  count = useUnreadNotificationCount(enabled);
  acknowledge = useAcknowledgeNotifications();
  return null;
}

beforeEach(() => {
  mockActiveIdentityKey = 'me';
  mockQueryResult = { data: undefined };
  mockUseQuery.mockClear();
  mockSetQueryCache.mockClear();
  mockAcknowledgeNotifications.mockClear();
  mockInvalidateQuery.mockClear();
});

describe('useUnreadNotificationCount', () => {
  it('disables the subscription without an active identity', async () => {
    mockActiveIdentityKey = null;

    await render(<Probe />);

    expect(mockUseQuery).toHaveBeenCalledWith(
      ['unread_notification_count', ''],
      expect.anything(),
      undefined,
      false,
    );
    expect(count).toBe(0);
  });

  it('disables the subscription when not enabled', async () => {
    await render(<Probe enabled={false} />);

    expect(mockUseQuery.mock.calls[0]?.[3]).toBe(false);
  });

  it('decodes the merged count', async () => {
    mockQueryResult = { data: countResponse(7) };

    await render(<Probe />);

    expect(count).toBe(7);
  });

  it('subscribes under the new identity after a switch', async () => {
    const { rerender } = await render(<Probe />);
    mockActiveIdentityKey = 'you';

    await rerender(<Probe />);

    const lastCall = mockUseQuery.mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual(['unread_notification_count', 'you']);
    expect(lastCall?.[3]).toBe(true);
  });
});

describe('useAcknowledgeNotifications', () => {
  it('zeroes the badge, acknowledges on every server and drops the cache', async () => {
    mockQueryResult = { data: countResponse(3) };
    await render(<Probe />);

    await act(() => acknowledge());

    const key = ['unread_notification_count', 'me'];
    expect(mockSetQueryCache).toHaveBeenCalledWith(key, {
      data: countResponse(0),
    });
    expect(mockAcknowledgeNotifications).toHaveBeenCalledTimes(1);
    expect(mockInvalidateQuery).toHaveBeenCalledWith(key);
  });

  it('does nothing without an active identity', async () => {
    mockActiveIdentityKey = null;
    await render(<Probe />);

    await act(() => acknowledge());

    expect(mockAcknowledgeNotifications).not.toHaveBeenCalled();
  });
});

describe('unreadNotificationsBadgeLabel', () => {
  it('hides zero, shows small counts and caps at 99+', () => {
    expect(unreadNotificationsBadgeLabel(0)).toBeNull();
    expect(unreadNotificationsBadgeLabel(5)).toBe('5');
    expect(unreadNotificationsBadgeLabel(99)).toBe('99');
    expect(unreadNotificationsBadgeLabel(100)).toBe('99+');
  });
});
