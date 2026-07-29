const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Unpadded base64url (RFC 7515) encoding of `bytes`. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    out += BASE64URL_ALPHABET[a >> 2];
    out += BASE64URL_ALPHABET[((a & 0x03) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) {
      out += BASE64URL_ALPHABET[((b & 0x0f) << 2) | ((c ?? 0) >> 6)];
    }
    if (c !== undefined) {
      out += BASE64URL_ALPHABET[c & 0x3f];
    }
  }
  return out;
}
