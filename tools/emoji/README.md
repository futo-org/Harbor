# emoji

Scripts that generate the app's emoji data, sprite pages and fonts. They only
write to `apps/harbor`; the app never reads from here. Each script formats what
it writes with Biome.

| Script | Writes (under `apps/harbor`) |
|---|---|
| `generate:data` (`generate-data.ts`) | `src/common/emoji/pickerEmojis.json`: the picker's emoji in order, with names, categories and emojibase's English search tags |
| `generate:sprites` (`generate-sprites.ts`) | The Android picker's sprite pages (`modules/emoji-sprite/android/src/main/assets/emoji-sprite/`) and their layout (`src/common/emoji/spritePages.ts`) |
| `generate:font` (`generate-font.py`) | The Twemoji color fonts (`public/fonts/Twemoji-<hash>.woff2`, `src/common/assets/fonts/Twemoji.ttf`, `TwemojiCbdt.ttf`) and `src/common/assets/twemojiFont.ts` |
| `generate:fingerprint-emojis` (`generate-fingerprint-emojis.ts`) | `src/common/emoji/fingerprintEmojis.json`: the pairing fingerprint's pool |

`versions.json` is the contract between the download and the scripts: the
download fetches what it names, and the scripts read exactly that, from
`downloads/` (gitignored), never from the network.

- `twemoji`: the Twemoji release (jdecked/twemoji tag, without the `v`).
- `unicode.font`: the Twemoji release's Unicode version (jdecked names releases
  after it: 17.0.3 is 17.0), for the emoji-style variation sequences the font
  declares. Bump it with `twemoji`.
- `unicode.picker`: the Unicode version of the picker's emoji (`generate:data`,
  `generate:sprites`). Bumping it changes `pickerEmojis.json` and the sprite
  pages; the Twemoji release must cover it.
- `unicode.fingerprint`: the version the pairing fingerprint's pool was frozen
  at. Never bumped: both devices of a pairing must pick from the same pool.

The npm dependencies are pinned by `package.json` and the lockfile; the Python
ones resolve as of the `exclude-newer` date in `generate-font.py`'s header. The
fonts are stamped with the release commit's time, which the release archive
gives every file, so rebuilding gives identical files.

## Custom emoji

Listed in `custom-emojis.json` (`after`: the emoji the picker shows it after),
with their art in `svg/`, named like Twemoji's files. Each SVG needs a
`<title>` for Biome. After a change, rerun all three generate scripts.

## Setup

`generate:font` needs uv (e.g. `brew install uv`).

From this folder, download the files `versions.json` names, from GitHub and
unicode.org. Run it again after every change to `versions.json`: it always
deletes `downloads/` and starts from scratch.

```bash
pnpm download
```

## Running

From this folder. The data and the sprites both follow the picker's emoji list,
so a change to it needs both. The sprites and the font are both rendered from
the Twemoji SVGs, so a change to those needs both.

```bash
pnpm generate:data
```

```bash
pnpm generate:sprites
```

```bash
pnpm generate:font
```

The font build takes about 20 minutes.

`generate:fingerprint-emojis` is not part of the regular run: the pool is
frozen, since both devices of a pairing must pick from the same list. The script
only documents where the file came from, and fails unless it reproduces it.
