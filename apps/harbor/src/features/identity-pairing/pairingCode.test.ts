// We need some js-core functionality but not any of the native/wasm code.
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../packages/js-core/src/proto/v2'),
  ...jest.requireActual('../../../../../packages/js-core/src/utils/hex'),
}));
jest.mock('@/src/common/constants', () => ({
  ...jest.requireActual('@/src/common/constants'),
  HARBOR_APP_URL: 'https://harbor.example',
}));

import { v2 } from '@polycentric/react-native';
import {
  EncodingMode,
  encodePairingCode,
  extractPairingInfo,
  pairingLinkFrom,
} from './pairingCode';

const PAIRING_INFO = v2.PairingInfo.create({
  server: 'https://server.example',
  digestSha256: new Uint8Array(Array.from({ length: 32 }, (_, i) => i)),
});

function expectMatchingPairingInfo(info: v2.PairingInfo | undefined) {
  expect(info?.server).toEqual(PAIRING_INFO.server);
  expect(info?.digestSha256).toEqual(PAIRING_INFO.digestSha256);
}

describe('extractPairingInfo', () => {
  it('decodes a hex code', () => {
    const code = encodePairingCode(PAIRING_INFO, EncodingMode.HEX);
    expectMatchingPairingInfo(extractPairingInfo(code));
  });

  it('decodes a base64 code', () => {
    const code = encodePairingCode(PAIRING_INFO, EncodingMode.BASE64);
    expectMatchingPairingInfo(extractPairingInfo(code));
  });

  it('decodes a pairing link', () => {
    const link = pairingLinkFrom(PAIRING_INFO);
    expect(link).toBe(
      `https://harbor.example/login/pair?code=${encodePairingCode(PAIRING_INFO, EncodingMode.BASE64)}`,
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
