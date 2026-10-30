import type { EventKey, ServerPushResult } from '@polycentric/react-native';

jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
}));

import { useEventPushIssuesStore } from './useEventPushIssuesStore';

const get = () => useEventPushIssuesStore.getState();

const SERVER_A = 'https://a.example';
const SERVER_B = 'https://b.example';
const IDENTITY = 'identity';
const OTHER_IDENTITY = 'other identity';

const key = (sequence: number, identity = IDENTITY): EventKey => ({
  collection: 2,
  identity,
  signedBy: { keyType: 1, key: new Uint8Array([1, 2, 3]).buffer },
  sequence: BigInt(sequence),
});

const issues = (
  sequence: number,
  {
    errors = [],
    warnings = [],
    identity = IDENTITY,
  }: { errors?: string[]; warnings?: string[]; identity?: string },
) => ({ key: key(sequence, identity), errors, warnings });

const result = (
  server: string,
  eventIssues: ServerPushResult['eventIssues'] = [],
  error?: unknown,
  identity = IDENTITY,
): ServerPushResult =>
  error === undefined
    ? { identity, server, eventIssues }
    : { identity, server, eventIssues, error };

const issueList = (identity = IDENTITY) =>
  Object.values(get().issues[identity] ?? {});

beforeEach(() => {
  get().clearAll();
});

describe('useEventPushIssuesStore', () => {
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

    it('updates repeat issues without returning them as new', () => {
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

    it('drops errors once the event is stored with only warnings', () => {
      get().record([result(SERVER_A, [issues(1, { errors: ['too long'] })])]);
      get().record([
        result(SERVER_A, [issues(1, { warnings: ['field dropped'] })]),
      ]);

      expect(issueList()).toEqual([
        expect.objectContaining({ errors: [], warnings: ['field dropped'] }),
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

    it("keeps each identity's issues separate", () => {
      get().record([result(SERVER_A, [issues(1, { errors: ['too long'] })])]);
      get().record([
        result(
          SERVER_A,
          [
            issues(1, {
              warnings: ['field dropped'],
              identity: OTHER_IDENTITY,
            }),
          ],
          undefined,
          OTHER_IDENTITY,
        ),
      ]);

      expect(issueList()).toEqual([
        expect.objectContaining({ errors: ['too long'] }),
      ]);
      expect(issueList(OTHER_IDENTITY)).toEqual([
        expect.objectContaining({ warnings: ['field dropped'] }),
      ]);
    });

    it("leaves other identities' state untouched", () => {
      get().record([result(SERVER_A, [issues(1, { errors: ['too long'] })])]);
      const before = get().issues[IDENTITY];
      get().record([
        result(
          SERVER_A,
          [issues(1, { errors: ['too long'], identity: OTHER_IDENTITY })],
          undefined,
          OTHER_IDENTITY,
        ),
      ]);

      expect(get().issues[IDENTITY]).toBe(before);
    });
  });

  it('ignores whether a push failed', () => {
    get().record([result(SERVER_A, [issues(1, { errors: ['too long'] })])]);
    get().record([result(SERVER_A, [], new Error('unreachable'))]);

    expect(issueList()).toHaveLength(1);
  });

  describe('removing issues', () => {
    beforeEach(() => {
      get().record([
        result(SERVER_A, [issues(1, { errors: ['too long'] })]),
        result(SERVER_B, [issues(1, { warnings: ['field dropped'] })]),
      ]);
      get().record([
        result(
          SERVER_A,
          [issues(1, { errors: ['too long'], identity: OTHER_IDENTITY })],
          undefined,
          OTHER_IDENTITY,
        ),
      ]);
    });

    it('dismisses one issue', () => {
      const [first] = issueList();
      get().dismiss(IDENTITY, first.id);

      expect(issueList().map((issue) => issue.server)).toEqual([SERVER_B]);
      expect(issueList(OTHER_IDENTITY)).toHaveLength(1);
    });

    it("clears a server's issues for one identity", () => {
      get().clearServer(IDENTITY, SERVER_A);

      expect(issueList().map((issue) => issue.server)).toEqual([SERVER_B]);
      expect(issueList(OTHER_IDENTITY)).toHaveLength(1);
    });

    it('clears everything', () => {
      get().clearAll();

      expect(get().issues).toEqual({});
    });

    it('re-adds a dismissed issue as new when it is reported again', () => {
      const [first] = issueList();
      get().dismiss(IDENTITY, first.id);
      const added = get().record([
        result(SERVER_A, [issues(1, { errors: ['too long'] })]),
      ]);

      expect(added.map((issue) => issue.id)).toEqual([first.id]);
    });
  });
});
