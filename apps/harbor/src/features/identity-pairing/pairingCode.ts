export type PairingSessionInfo = {
  /** URL of the server hosting the pairing session. */
  readonly origin: string;

  /** Identity string of the identity being paired. */
  readonly identity: string;

  /**
   * ID string for the specific pairing session.
   * Derived by encoding the intial pairing session's signature as hex.
   */
  readonly code: string;
};

/**
 * -----------------------------------------------------------------------------
 * The pairing code is a JSON string that contains enough info for the claimer
 * to join the pairing session securely.
 * The QR code contains the raw string directly to keep it small-ish.
 * The copy button and manual entry use a hex-encoded version so that it appears
 * as an opaque token string to the user.
 * -----------------------------------------------------------------------------
 */

export function encodePairingCode(info: PairingSessionInfo): string {
  return JSON.stringify(info);
}

export function decodePairingCode(
  encoded: string,
): PairingSessionInfo | undefined {
  try {
    const obj = JSON.parse(encoded);

    if (typeof obj !== 'object') return undefined;
    if (typeof obj.origin !== 'string') return undefined;
    if (typeof obj.identity !== 'string') return undefined;
    if (typeof obj.code !== 'string') return undefined;

    return obj as PairingSessionInfo;
  } catch {
    return undefined;
  }
}
