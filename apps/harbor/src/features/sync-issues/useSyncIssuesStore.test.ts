import type { EventKey, ServerPushResult } from '@polycentric/react-native';

jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../packages/js-core/src/proto/v2'),
}));

import { useSyncIssuesStore } from './useSyncIssuesStore';

const get = () => useSyncIssuesStore.getState();

const SERVER_A = 'https://a.example';
const SERVER_B = 'https://b.example';

const key = (sequence: number): EventKey => ({
  collection: 2,
  identity: 'identity',
  signedBy: { keyType: 1, key: new Uint8Array([1, 2, 3]).buffer },
  sequence: BigInt(sequence),
});

const issues = (
  sequence: number,
  { errors = [], warnings = [] }: { errors?: string[]; warnings?: string[] },
) => ({ key: key(sequence), errors, warnings });

const result = (
  server: string,
  eventIssues: ServerPushResult['eventIssues'] = [],
  error?: unknown,
): ServerPushResult =>
  error === undefined
    ? { server, eventIssues }
    : { server, eventIssues, error };

const issueList = () => Object.values(get().issues);

beforeEach(() => {
  get().clearAll();
});

describe('useSyncIssuesStore', () => {
  describe('record', () => {
    it('adds new issues and returns them', () => {
      const added = get().record(
        [result(SERVER_A, [issues(1, { errors: ['too long'] })])],
        100,
      );

      expect(added).toHaveLength(1);
      expect(added[0]).toMatchObject({
        server: SERVER_A,
        errors: ['too long'],
        warnings: [],
        firstSeen: 100,
        lastSeen: 100,
      });
      expect(issueList()).toEqual(added);
    });

    it('merges repeat issues without returning them as new', () => {
      get().record(
        [result(SERVER_A, [issues(1, { errors: ['too long'] })])],
        100,
      );
      const added = get().record(
        [
          result(SERVER_A, [
            issues(1, { errors: ['too long'], warnings: ['field dropped'] }),
          ]),
        ],
        200,
      );

      expect(added).toEqual([]);
      expect(issueList()).toEqual([
        expect.objectContaining({
          errors: ['too long'],
          warnings: ['field dropped'],
          firstSeen: 100,
          lastSeen: 200,
        }),
      ]);
    });

    it('keeps issues missing from a later sync', () => {
      get().record([result(SERVER_A, [issues(1, { errors: ['too long'] })])]);
      get().record([result(SERVER_A, [])]);

      expect(issueList()).toHaveLength(1);
    });

    it('keeps the same event separate per server', () => {
      get().record([
        result(SERVER_A, [issues(1, { errors: ['too long'] })]),
        result(SERVER_B, [issues(1, { errors: ['too long'] })]),
      ]);

      expect(issueList().map((issue) => issue.server)).toEqual([
        SERVER_A,
        SERVER_B,
      ]);
    });

    it('keeps different events separate', () => {
      get().record([
        result(SERVER_A, [
          issues(1, { errors: ['too long'] }),
          issues(2, { warnings: ['field dropped'] }),
        ]),
      ]);

      expect(issueList()).toHaveLength(2);
    });
  });

  describe('server failures', () => {
    it('replaces a server failure each sync', () => {
      get().record([result(SERVER_A, [], new Error('unreachable'))], 100);
      get().record([result(SERVER_A, [], new Error('timed out'))], 200);

      expect(get().serverFailures).toEqual({
        [SERVER_A]: { message: 'timed out', at: 200 },
      });
    });

    it('clears a server failure after a push without one', () => {
      get().record([
        result(SERVER_A, [], new Error('unreachable')),
        result(SERVER_B, [], 'offline'),
      ]);
      get().record([result(SERVER_A)]);

      expect(get().serverFailures).toEqual({
        [SERVER_B]: { message: 'offline', at: expect.any(Number) },
      });
    });

    it('leaves event issues alone when a push fails', () => {
      get().record([result(SERVER_A, [issues(1, { errors: ['too long'] })])]);
      get().record([result(SERVER_A, [], new Error('unreachable'))]);

      expect(issueList()).toHaveLength(1);
    });
  });

  describe('removing issues', () => {
    beforeEach(() => {
      get().record([
        result(SERVER_A, [issues(1, { errors: ['too long'] })], 'offline'),
        result(SERVER_B, [issues(1, { warnings: ['field dropped'] })]),
      ]);
    });

    it('dismisses one issue', () => {
      const [first] = issueList();
      get().dismiss(first.id);

      expect(issueList().map((issue) => issue.server)).toEqual([SERVER_B]);
    });

    it("clears a server's issues and failure", () => {
      get().clearServer(SERVER_A);

      expect(issueList().map((issue) => issue.server)).toEqual([SERVER_B]);
      expect(get().serverFailures).toEqual({});
    });

    it('clears everything', () => {
      get().clearAll();

      expect(get().issues).toEqual({});
      expect(get().serverFailures).toEqual({});
    });

    it('re-adds a dismissed issue as new when it is reported again', () => {
      const [first] = issueList();
      get().dismiss(first.id);
      const added = get().record([
        result(SERVER_A, [issues(1, { errors: ['too long'] })]),
      ]);

      expect(added.map((issue) => issue.id)).toEqual([first.id]);
    });
  });
});
