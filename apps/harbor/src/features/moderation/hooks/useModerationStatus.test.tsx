import { render } from '@testing-library/react-native';

// Identity the mocked client reports as active; tests reassign it.
let mockActiveIdentityKey: string | null = 'me';
// What the mocked useQuery returns; tests reassign it.
let mockQueryResult: { data: ArrayBuffer | undefined; isLoading: boolean } = {
  data: undefined,
  isLoading: true,
};
const mockUseQuery = jest.fn(() => mockQueryResult);

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  usePolycentric: () => ({ activeIdentityKey: mockActiveIdentityKey }),
}));

jest.mock('@/src/common/query/hooks/useQuery', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...(args as [])),
}));

jest.mock('@polycentric/react-native', () => ({
  Query: { IsModerator: class IsModerator {} },
  // Mirrors the real wire helper (covered by its own test in js-core):
  // the fan-out response is a JSON `serverUrl -> bool` map.
  decodeStatusByServer: (data: ArrayBuffer) =>
    new Map<string, boolean>(
      Object.entries(
        JSON.parse(new TextDecoder().decode(new Uint8Array(data))),
      ),
    ),
}));

import useModerationStatus, {
  type ModerationStatus,
} from './useModerationStatus';

/** Encode a fan-out response the way the rust core emits it. */
function statusResponse(record: Record<string, boolean>): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(record)).buffer as ArrayBuffer;
}

// `renderHook` renders an empty result under this jest-expo setup, so run
// the hook through a probe component like the other component tests do.
let status: ModerationStatus;
function Probe() {
  status = useModerationStatus();
  return null;
}

beforeEach(() => {
  mockActiveIdentityKey = 'me';
  mockQueryResult = { data: undefined, isLoading: true };
  mockUseQuery.mockClear();
});

describe('useModerationStatus', () => {
  it('disables the query when there is no active identity', async () => {
    mockActiveIdentityKey = null;
    mockQueryResult = { data: undefined, isLoading: false };

    await render(<Probe />);

    // Key is the identity-scoped is_moderator key, with the query disabled.
    expect(mockUseQuery).toHaveBeenCalledWith(
      ['is_moderator', ''],
      expect.anything(),
      undefined,
      false,
    );
    expect(status).toMatchObject({
      isLoading: false,
      moderatedServers: [],
      isModerator: false,
    });
  });

  it('scopes the query key to the active identity', async () => {
    await render(<Probe />);

    expect(mockUseQuery).toHaveBeenCalledWith(
      ['is_moderator', 'me'],
      expect.anything(),
      undefined,
      true,
    );
  });

  it('keeps only the servers that report moderator status, in order', async () => {
    mockQueryResult = {
      data: statusResponse({
        'http://a': true,
        'http://b': false,
        'http://c': true,
      }),
      isLoading: false,
    };

    await render(<Probe />);

    expect(status.moderatedServers).toEqual(['http://a', 'http://c']);
    expect(status.isModerator).toBe(true);
    expect(status.isLoading).toBe(false);
  });

  it('reports not-a-moderator when no server confirms', async () => {
    mockQueryResult = {
      data: statusResponse({ 'http://a': false, 'http://b': false }),
      isLoading: false,
    };

    await render(<Probe />);

    expect(status.moderatedServers).toEqual([]);
    expect(status.isModerator).toBe(false);
  });

  it('reports not-a-moderator when the map is empty', async () => {
    // A server that fails to answer is simply missing from the map.
    mockQueryResult = { data: statusResponse({}), isLoading: false };

    await render(<Probe />);

    expect(status.moderatedServers).toEqual([]);
    expect(status.isModerator).toBe(false);
  });

  it('reports not-a-moderator while no data has arrived', async () => {
    mockQueryResult = { data: undefined, isLoading: true };

    await render(<Probe />);

    expect(status.moderatedServers).toEqual([]);
    expect(status.isModerator).toBe(false);
    expect(status.isLoading).toBe(true);
  });
});
