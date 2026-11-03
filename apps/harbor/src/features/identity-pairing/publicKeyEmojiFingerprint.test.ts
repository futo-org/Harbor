import { createHash } from 'node:crypto';
import fingerprintEmojis from '@/src/common/emoji/fingerprintEmojis.json';
import { publicKeyEmojiFingerprint } from './publicKeyEmojiFingerprint';

describe('publicKeyEmojiFingerprint', () => {
  // Both devices must pick from the same pool, so it never changes.
  it('picks from the frozen pool', () => {
    expect(fingerprintEmojis).toHaveLength(1026);
    expect(
      createHash('sha256')
        .update(JSON.stringify(fingerprintEmojis))
        .digest('hex'),
    ).toBe('203abb3b50ff0934fbdb5f2510484486c0a30675f8641ae0d794686da072ad72');
  });

  it('gives the same emoji for a seed as earlier app versions', () => {
    expect(publicKeyEmojiFingerprint('')).toEqual(['🐕‍🦺', '🙂‍↔️', '🥩']);
    expect(publicKeyEmojiFingerprint('harbor')).toEqual(['🥱', '🐈‍⬛', '🍭']);
    expect(
      publicKeyEmojiFingerprint(
        '020225a394cac01413ff43527f1644b1772d78d2cea873de1e8ae2f9c3c9f47b',
      ),
    ).toEqual(['🪔', '🚆', '🏭']);
    expect(publicKeyEmojiFingerprint('pairing-seed-1')).toEqual([
      '🕊',
      '🧼',
      '🌄',
    ]);
    expect(publicKeyEmojiFingerprint('pairing-seed-2')).toEqual([
      '🔎',
      '🫐',
      '💯',
    ]);
  });
});
