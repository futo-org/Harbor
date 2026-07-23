import type { PolycentricClient } from '@polycentric/react-native';
import useModerationStatus from './useModerationStatus';

type IsModeratorFn = (server: string) => Promise<boolean>;

// Minimal structural stand-in for the client — refresh only touches
// activeIdentityKey, servers, and isModerator.
function mockClient(
  activeIdentityKey: string | null,
  servers: string[],
  isModerator: IsModeratorFn,
): PolycentricClient {
  return {
    activeIdentityKey,
    servers,
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
      .refresh(mockClient(null, ['http://a'], async () => true));

    expect(useModerationStatus.getState()).toMatchObject({
      isLoading: false,
      moderatedServers: [],
      isModerator: false,
    });
  });

  it('keeps only the servers that report moderator status, in order', async () => {
    await useModerationStatus
      .getState()
      .refresh(
        mockClient(
          'me',
          ['http://a', 'http://b', 'http://c'],
          async (server) => server !== 'http://b',
        ),
      );

    const state = useModerationStatus.getState();
    expect(state.moderatedServers).toEqual(['http://a', 'http://c']);
    expect(state.isModerator).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it('reports not-a-moderator when no server confirms', async () => {
    await useModerationStatus
      .getState()
      .refresh(mockClient('me', ['http://a', 'http://b'], async () => false));

    const state = useModerationStatus.getState();
    expect(state.moderatedServers).toEqual([]);
    expect(state.isModerator).toBe(false);
  });

  it('treats a server that errors as not-a-moderator', async () => {
    await useModerationStatus.getState().refresh(
      mockClient('me', ['http://ok', 'http://bad'], async (server) => {
        if (server === 'http://bad') throw new Error('unreachable');
        return true;
      }),
    );

    const state = useModerationStatus.getState();
    expect(state.moderatedServers).toEqual(['http://ok']);
    expect(state.isModerator).toBe(true);
  });

  it('reports not-a-moderator when no servers are configured', async () => {
    await useModerationStatus
      .getState()
      .refresh(mockClient('me', [], async () => true));

    const state = useModerationStatus.getState();
    expect(state.moderatedServers).toEqual([]);
    expect(state.isModerator).toBe(false);
    expect(state.isLoading).toBe(false);
  });
});
