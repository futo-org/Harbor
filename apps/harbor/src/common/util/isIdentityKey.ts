// A polycentric identity: exactly 64 hex chars (a SHA-256 hash), in any case.
export function isIdentityKey(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}
