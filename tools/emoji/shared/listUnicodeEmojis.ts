import { readFileSync } from 'node:fs';

/**
 * Unicode's fully-qualified emoji of `version`, in file order, without skin
 * tones, from its downloaded `emoji-test.txt` (see download.ts). `category` is
 * the slug of the Unicode group (`smileys-emotion`).
 */
export function listUnicodeEmojis(version: string) {
  const emojiTest = readFileSync(
    new URL(`../downloads/unicode/${version}/emoji-test.txt`, import.meta.url),
    'utf8',
  );

  const emojis: { emoji: string; name: string; category: string }[] = [];
  // Every row comes after a `# group:` line.
  let category = '';
  for (const line of emojiTest.split('\n')) {
    const group = line.match(/^# group: (.+)$/);
    if (group) {
      category = group[1].toLowerCase().replace(/[^a-z0-9]+/g, '-');
      continue;
    }
    // e.g. `1F600  ; fully-qualified  # 😀 E1.0 grinning face`
    const row = line.match(
      /^([0-9A-F ]+?)\s*; fully-qualified\s*# \S+ E\S+ (.+)$/,
    );
    if (!row) continue;
    let codePoints = row[1].split(' ').map((hex) => Number.parseInt(hex, 16));
    if (
      codePoints.some(
        (codePoint) => codePoint >= 0x1f3fb && codePoint <= 0x1f3ff,
      )
    )
      continue;
    // A single code point + U+FE0F is spelled without the U+FE0F (❤).
    if (codePoints.length === 2 && codePoints[1] === 0xfe0f)
      codePoints = [codePoints[0]];
    emojis.push({
      emoji: String.fromCodePoint(...codePoints),
      name: row[2],
      category,
    });
  }
  return emojis;
}
