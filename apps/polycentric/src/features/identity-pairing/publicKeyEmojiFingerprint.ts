import { sha256 } from '@noble/hashes/sha2.js';
import { categories } from '../reaction/emojiData';

const FINGERPRINT_EMOJI_CATEGORIES = new Set([
  'smileys & emotion',
  'animals & nature',
  'food & drink',
  'travel & places',
  'activities',
  'objects',
]);

const emojiFingerprintPool = categories
  .filter((cat) => FINGERPRINT_EMOJI_CATEGORIES.has(cat.name.toLowerCase()))
  .flatMap((cat) => cat.emojis)
  .map((e) => e.emoji);

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
