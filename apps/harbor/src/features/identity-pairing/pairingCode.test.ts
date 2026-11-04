// Code encoding itself (hex and both base64 alphabets) is rs-core's, and
// tested there; the shim stands in for it here.
jest.mock('@polycentric/react-native', () =>
  jest.requireActual('@/test/polycentric'),
);
jest.mock('@/src/common/constants', () => ({
  ...jest.requireActual('@/src/common/constants'),
  HARBOR_APP_URL: 'https://harbor.example',
}));

import { v2 } from '@polycentric/react-native';
import {
  encodePairingCode,
  extractPairingInfo,
  pairingLinkFrom,
} from './pairingCode';

const PAIRING_INFO = v2.PairingInfo.create({
  server: 'https://server.example',
  digestSha256: new Uint8Array(Array.from({ length: 32 }, (_, i) => i)).buffer,
});

function expectMatchingPairingInfo(info: v2.PairingInfo | undefined) {
  expect(info?.server).toEqual(PAIRING_INFO.server);
  expect(info?.digestSha256).toEqual(PAIRING_INFO.digestSha256);
}

describe('extractPairingInfo', () => {
  it('decodes a bare code', () => {
    expectMatchingPairingInfo(
      extractPairingInfo(encodePairingCode(PAIRING_INFO)),
    );
  });

  it('decodes a pairing link', () => {
    const link = pairingLinkFrom(PAIRING_INFO);
    expect(link).toBe(
      `https://harbor.example/login/pair?code=${encodeURIComponent(encodePairingCode(PAIRING_INFO))}`,
    );
    expectMatchingPairingInfo(extractPairingInfo(link));
  });

  it('ignores surrounding whitespace', () => {
    const link = pairingLinkFrom(PAIRING_INFO);
    expectMatchingPairingInfo(extractPairingInfo(`  \n${link}\t `));
  });

  it('ignores the host of a pairing link', () => {
    const link = pairingLinkFrom(PAIRING_INFO).replace(
      'https://harbor.example',
      'https://other.example',
    );
    expectMatchingPairingInfo(extractPairingInfo(link));
  });

  it('rejects garbage input', () => {
    expect(extractPairingInfo('not a pairing code')).toBeUndefined();
  });
});
