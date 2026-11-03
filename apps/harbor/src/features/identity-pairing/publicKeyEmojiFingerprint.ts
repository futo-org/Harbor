import { sha256 } from '@noble/hashes/sha2.js';
import emojiFingerprintPool from '@/src/common/emoji/fingerprintEmojis.json';

export function publicKeyEmojiFingerprint(
  seed: string,
): [string, string, string] {
  const hash = sha256(new TextEncoder().encode(seed));
  const view = new DataView(hash.buffer);

  return [
    emojiFingerprintPool[view.getUint32(0) % emojiFingerprintPool.length]!,
    emojiFingerprintPool[view.getUint32(4) % emojiFingerprintPool.length]!,
    emojiFingerprintPool[view.getUint32(8) % emojiFingerprintPool.length]!,
  ];
}
