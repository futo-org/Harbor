import { Base64 } from 'js-base64';
import { bytesToHex, hexToBytes, v2 } from '@polycentric/react-native';
import {
  HARBOR_APP_URL,
  PAIRING_CODE_PARAM,
  Routes,
} from '@/src/common/constants';

/**
 * -----------------------------------------------------------------------------
 * The `PairingInfo` protobuf message contains the information we need to join
 * a pairing session securely.
 * We used to encode it as either hex or base64 depending on the context,
 * but we should only use pairing links now.
 * -----------------------------------------------------------------------------
 */

export enum EncodingMode {
  BASE64 = 'base64',
  HEX = 'hex',
}

/** Encode the pairing info for use in a QR code or copy/paste */
export function encodePairingCode(
  info: v2.PairingInfo,
  mode: EncodingMode,
): string {
  const bytes = v2.PairingInfo.toBinary(info);

  if (mode === EncodingMode.BASE64) {
    return Base64.fromUint8Array(bytes, true);
  } else if (mode === EncodingMode.HEX) {
    return bytesToHex(bytes);
  }

  throw new Error('Unsupported encoding mode');
}

/** Decode a pairing code received from another device */
export function decodePairingCode(
  encoded: string,
  mode: EncodingMode,
): v2.PairingInfo | undefined {
  try {
    let bytes: Uint8Array;

    if (mode === EncodingMode.BASE64) {
      bytes = Base64.toUint8Array(encoded);
    } else if (mode === EncodingMode.HEX) {
      const maybeBytes = hexToBytes(encoded);
      if (!maybeBytes) return undefined;
      bytes = maybeBytes;
    } else {
      return undefined;
    }

    const info = v2.PairingInfo.fromBinary(bytes);

    // Do some sanity checks
    if (info.digestSha256.length === 0) return undefined;
    if (info.server.length === 0) return undefined;

    return info;
  } catch {
    return undefined;
  }
}

/** Build a pairing link to share to another device. */
export function pairingLinkFrom(info: v2.PairingInfo): string {
  const url = new URL(`${HARBOR_APP_URL}${Routes.onboarding.pair}`);

  url.searchParams.set(
    PAIRING_CODE_PARAM,
    encodePairingCode(info, EncodingMode.BASE64),
  );

  return url.toString();
}

/** Extract the pairing info from a pairing link or pairing code. */
export function extractPairingInfo(input: string): v2.PairingInfo | undefined {
  const trimmed = input.trim();
  let code = trimmed;

  // Depending on the platform, a non-url input may throw or just resolve to
  // a `/` pathname.
  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/, ''); // Remove trailing slashes
    if (path === Routes.onboarding.pair) {
      const param = url.searchParams.get(PAIRING_CODE_PARAM);

      // Either we found a code or we have a pairing link without one
      if (param === null) return undefined;
      code = param;
    }
  } catch {}

  return (
    decodePairingCode(code, EncodingMode.HEX) ??
    decodePairingCode(code, EncodingMode.BASE64)
  );
}
