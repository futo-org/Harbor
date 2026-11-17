/** 32 bytes, lowercase hex. */
const IDENTITY_PATTERN = /^[0-9a-f]{64}$/;

export function isIdentityKey(identity: string): boolean {
  return IDENTITY_PATTERN.test(identity);
}

/**
 * Throw the error produced by `toError` unless `identity` is a well-formed
 * identity key.
 */
export function assertIdentity(
  identity: string,
  toError: (message: string) => Error,
): void {
  if (!isIdentityKey(identity)) {
    throw toError('identity must be a 32 byte lowercase hex string');
  }
}
