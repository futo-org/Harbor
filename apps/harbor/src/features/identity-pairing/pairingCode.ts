import {
  decodePairingCode as decodePairingCodeFfi,
  encodePairingCode as encodePairingCodeFfi,
  type v2,
} from '@polycentric/react-native';
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

/** Encode the pairing info for use in a QR code or copy/paste. */
export function encodePairingCode(info: v2.PairingInfo): string {
  return encodePairingCodeFfi(info);
}

/** Decode a pairing code (hex or base64) received from another device. */
export function decodePairingCode(encoded: string): v2.PairingInfo | undefined {
  return decodePairingCodeFfi(encoded);
}

/** Build a pairing link to share to another device. */
export function pairingLinkFrom(info: v2.PairingInfo): string {
  const url = new URL(`${HARBOR_APP_URL}${Routes.onboarding.pair}`);

  url.searchParams.set(PAIRING_CODE_PARAM, encodePairingCode(info));

  return url.toString();
}

/** Extract the pairing info from a pairing link or pairing code. */
export function extractPairingInfo(input: string): v2.PairingInfo | undefined {
  const trimmed = input.trim();
  let code = trimmed;

  // Try extracting the pairing code if the input is a pairing link.
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

  // rs-core accepts hex and either base64 alphabet.
  return decodePairingCode(code);
}
