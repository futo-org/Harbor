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
