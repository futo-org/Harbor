import type { PolycentricClient } from '@polycentric/react-native';
import useModerationStatus from './useModerationStatus';

type IsModeratorFn = () => Promise<Map<string, boolean>>;

// Minimal structural stand-in for the client — refresh only touches
// activeIdentityKey and isModerator() (which now fans out internally and
// returns a serverUrl -> isModerator map).
function mockClient(
  activeIdentityKey: string | null,
  isModerator: IsModeratorFn,
): PolycentricClient {
  return {
    activeIdentityKey,
    isModerator,
  } as unknown as PolycentricClient;
}

beforeEach(() => {
  useModerationStatus.setState({
    isLoading: true,
    moderatedServers: [],
    isModerator: false,
  });
});

describe('useModerationStatus.refresh', () => {
  it('clears status when there is no active identity', async () => {
    await useModerationStatus
      .getState()
      .refresh(mockClient(null, async () => new Map([['http://a', true]])));

    expect(useModerationStatus.getState()).toMatchObject({
      isLoading: false,
      moderatedServers: [],
      isModerator: false,
    });
  });

  it('keeps only the servers that report moderator status, in order', async () => {
    await useModerationStatus.getState().refresh(
      mockClient(
        'me',
        async () =>
          new Map([
            ['http://a', true],
            ['http://b', false],
            ['http://c', true],
          ]),
      ),
    );

    const state = useModerationStatus.getState();
    expect(state.moderatedServers).toEqual(['http://a', 'http://c']);
    expect(state.isModerator).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it('reports not-a-moderator when no server confirms', async () => {
    await useModerationStatus.getState().refresh(
      mockClient(
        'me',
        async () =>
          new Map([
            ['http://a', false],
            ['http://b', false],
          ]),
      ),
    );

    const state = useModerationStatus.getState();
    expect(state.moderatedServers).toEqual([]);
    expect(state.isModerator).toBe(false);
  });

  it('treats a server absent from the map as not-a-moderator', async () => {
    // A server that fails to answer is simply missing from the map.
    await useModerationStatus
      .getState()
      .refresh(mockClient('me', async () => new Map([['http://ok', true]])));

    const state = useModerationStatus.getState();
    expect(state.moderatedServers).toEqual(['http://ok']);
    expect(state.isModerator).toBe(true);
  });

  it('treats a failed query as not-a-moderator', async () => {
    await useModerationStatus.getState().refresh(
      mockClient('me', async () => {
        throw new Error('unreachable');
      }),
    );

    const state = useModerationStatus.getState();
    expect(state.moderatedServers).toEqual([]);
    expect(state.isModerator).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it('reports not-a-moderator when the map is empty', async () => {
    await useModerationStatus
      .getState()
      .refresh(mockClient('me', async () => new Map()));

    const state = useModerationStatus.getState();
    expect(state.moderatedServers).toEqual([]);
    expect(state.isModerator).toBe(false);
    expect(state.isLoading).toBe(false);
  });
});
