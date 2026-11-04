import type { ServerPushResult } from '@polycentric/react-native';
import { useLastSyncStore } from './useLastSyncStore';

const result = (r: Partial<ServerPushResult>) =>
  ({
    identity: 'identity',
    server: 'https://one.example',
    eventIssues: [],
    ...r,
  }) as ServerPushResult;

beforeEach(() => useLastSyncStore.getState().clearAll());

describe('useLastSyncStore', () => {
  it('records a sync when any server accepted the push', () => {
    useLastSyncStore
      .getState()
      .record(
        [result({ error: new Error('offline') }), result({ server: 'b' })],
        100,
      );
    expect(useLastSyncStore.getState().lastSync).toEqual({ identity: 100 });
  });

  it('keeps the previous sync when every server failed', () => {
    useLastSyncStore.getState().record([result({})], 100);
    useLastSyncStore
      .getState()
      .record([result({ error: new Error('offline') })], 200);
    expect(useLastSyncStore.getState().lastSync).toEqual({ identity: 100 });
  });

  it('tracks identities separately', () => {
    useLastSyncStore.getState().record([result({})], 100);
    useLastSyncStore.getState().record([result({ identity: 'other' })], 200);
    expect(useLastSyncStore.getState().lastSync).toEqual({
      identity: 100,
      other: 200,
    });
  });
});
