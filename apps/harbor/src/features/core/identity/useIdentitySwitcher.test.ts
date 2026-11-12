import type {
  LoginId,
  LoginOverview,
  LoginStatus,
} from '@polycentric/react-native';
import { deriveIdentityRows } from './useIdentitySwitcher';

jest.mock('@/src/common/components/toast', () => ({
  toast: { error: jest.fn() },
}));
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  bytesToHex: (bytes: Uint8Array) =>
    Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''),
  usePolycentric: jest.fn(),
}));

function login(
  identity: string,
  keyType: number,
  key: number[],
  status: LoginStatus,
): LoginOverview {
  return {
    identity,
    publicKey: { keyType, key: new Uint8Array(key) },
    status,
  } as LoginOverview;
}

/** Strip a login down to the `LoginId` the rows carry. */
function id({ identity, publicKey }: LoginId): LoginId {
  return { identity, publicKey };
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

describe('deriveIdentityRows', () => {
  it('prefers a rotation key over a signing key regardless of order', () => {
    const signing = login('a', 1, [0x01], 'liveSigningKey');
    const rotation = login('a', 1, [0x02], 'liveRotationKey');

    for (const logins of permutations([signing, rotation])) {
      expect(deriveIdentityRows(logins, null)).toEqual([
        { identity: 'a', login: id(rotation) },
      ]);
    }
  });

  it('breaks ties by key type and then key bytes', () => {
    const lowType = login('a', 1, [0xff], 'liveSigningKey');
    const highTypeLowBytes = login('a', 2, [0x00], 'liveSigningKey');
    const lowTypeHighBytes = login('a', 1, [0xff, 0x00], 'liveSigningKey');

    for (const logins of permutations([
      highTypeLowBytes,
      lowTypeHighBytes,
      lowType,
    ])) {
      expect(deriveIdentityRows(logins, null)).toEqual([
        { identity: 'a', login: id(lowType) },
      ]);
    }
  });

  it('ignores logins that are not live', () => {
    const statuses: LoginStatus[] = [
      'pendingSignup',
      'pendingPair',
      'pendingRecovery',
      'revoked',
      'pendingDeletion',
    ];
    const dead = statuses.map((status, i) => login('a', 1, [i], status));
    const live = login('b', 1, [0x00], 'liveSigningKey');
    // A higher-ranked status that is not live doesn't beat a live login.
    const deadOnB = login('b', 1, [0x01], 'revoked');

    expect(deriveIdentityRows([...dead, live, deadOnB], null)).toEqual([
      { identity: 'b', login: id(live) },
    ]);
  });

  it('includes the active identity when it has no live login', () => {
    const active = id(login('a', 1, [0x05], 'pendingSignup'));
    const other = login('b', 1, [0x00], 'liveRotationKey');

    expect(
      deriveIdentityRows(
        [login('a', 1, [0x05], 'pendingSignup'), other],
        active,
      ),
    ).toEqual([
      { identity: 'a', login: active },
      { identity: 'b', login: id(other) },
    ]);
  });

  it('uses the most powerful login for the active identity', () => {
    const activeSigning = login('a', 1, [0x01], 'liveSigningKey');
    const rotation = login('a', 1, [0x02], 'liveRotationKey');

    expect(
      deriveIdentityRows([activeSigning, rotation], id(activeSigning)),
    ).toEqual([{ identity: 'a', login: id(rotation) }]);
  });

  it('sorts rows by identity key for any input order', () => {
    const logins = [
      login('c', 1, [0x00], 'liveSigningKey'),
      login('a', 1, [0x00], 'liveRotationKey'),
      login('b', 1, [0x00], 'liveSigningKey'),
    ];

    for (const permutation of permutations(logins)) {
      expect(
        deriveIdentityRows(permutation, null).map((row) => row.identity),
      ).toEqual(['a', 'b', 'c']);
    }
  });
});
