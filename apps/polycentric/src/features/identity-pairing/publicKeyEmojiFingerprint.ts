import { sha256 } from '@noble/hashes/sha2';
import { emojis as emojiPickerData } from 'rn-emoji-picker/dist/data';

const FINGERPRINT_EMOJI_CATEGORIES = new Set([
  'smileys & emotion',
  'animals & nature',
  'food & drink',
  'travel & places',
  'activities',
  'objects',
]);

const emojiFingerprintPool = emojiPickerData
  .filter((emoji) => FINGERPRINT_EMOJI_CATEGORIES.has(emoji.category))
  .map((emoji) => emoji.emoji);

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
