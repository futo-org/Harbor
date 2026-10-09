# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "nanoemoji",
#   "brotli",
#   # nanoemoji needs these but doesn't declare them.
#   "ninja",
#   "typing_extensions",
# ]
# ///
#
# Writes `public/fonts/Twemoji.woff2`, the Twemoji SVGs as a COLRv0 color
# font, which web text draws emoji with (see `app/+html.tsx`).
#
#   curl -L -o twemoji.tar.gz https://github.com/jdecked/twemoji/archive/refs/tags/v17.0.3.tar.gz
#   mkdir twemoji && tar -xzf twemoji.tar.gz -C twemoji --strip-components=1 '*/assets/svg/*'
#   pnpm -C apps/harbor generate:twemoji-font "$PWD/twemoji"
#
# Needs uv (e.g. `brew install uv`). A build takes about 12 minutes.
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.otlLib.builder import LOOKUP_FLAG_IGNORE_MARKS
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

# The Twemoji README's `img.emoji` CSS, in font units: a 1em square, margins
# of 0.1em before and 0.05em after, 0.1em below the baseline.
UNITS_PER_EM = 1000
SPACE_BEFORE = 100
SPACE_AFTER = 50
BASELINE_SHIFT = 100

output_file = Path(__file__).resolve().parent.parent / 'public' / 'fonts' / 'Twemoji.woff2'


def main():
    svg_dir = Path(sys.argv[1]).resolve() / 'assets' / 'svg'
    with tempfile.TemporaryDirectory() as build_dir:
        font = TTFont(build_twemoji_font(svg_dir, Path(build_dir)))
        ignore_variation_selector(font)
        font.flavor = 'woff2'
        font.save(output_file)


def build_twemoji_font(svg_dir, build_dir):
    # Only some file names keep VS16 (`fe0f`); without it, every sequence is
    # keyed the same way (see `ignore_variation_selector`).
    stage_dir = build_dir / 'svg'
    stage_dir.mkdir()
    for svg in svg_dir.glob('*.svg'):
        (stage_dir / svg.name.replace('-fe0f', '')).write_text(make_view_box_square(svg.read_text()))

    # nanoemoji scales each viewBox to fill ascender to descender, centered in
    # the advance; the transform moves it off center.
    subprocess.run(
        [
            sys.executable,
            '-m',
            'nanoemoji.nanoemoji',
            '--color_format=glyf_colr_0',
            '--family=Twemoji',
            f'--upem={UNITS_PER_EM}',
            f'--ascender={UNITS_PER_EM - BASELINE_SHIFT}',
            f'--descender={-BASELINE_SHIFT}',
            f'--width={SPACE_BEFORE + UNITS_PER_EM + SPACE_AFTER}',
            f'--transform=matrix(1 0 0 1 {(SPACE_BEFORE - SPACE_AFTER) / 2} 0)',
            f'--build_dir={build_dir}',
            '--output_file=Twemoji.ttf',
            *sorted(str(svg) for svg in stage_dir.iterdir()),
        ],
        check=True,
    )
    return build_dir / 'Twemoji.ttf'


# nanoemoji scales a viewBox's height to the glyph's, so the one SVG that
# isn't square (🍉, 36x25.22) came out 1.43em wide. Pads it like an `img`
# would show it: the short side centered.
def make_view_box_square(svg_text):
    match = re.search(r'viewBox="([^"]+)"', svg_text)
    x, y, width, height = map(float, match[1].split())
    size = max(width, height)
    view_box = f'{x - (size - width) / 2} {y - (size - height) / 2} {size} {size}'
    return svg_text.replace(match[0], f'viewBox="{view_box}"', 1)


# Matches sequences with or without VS16. Otherwise Chrome splits ZWJ
# sequences that contain it (🧍🏼‍♂️), and Safari breaks keycaps (1️⃣) and
# draws VS16 as a blank emoji-wide gap (❤️).
def ignore_variation_selector(font):
    font.setGlyphOrder([*font.getGlyphOrder(), 'uniFE0F'])
    font['glyf'].glyphs['uniFE0F'] = TTGlyphPen(None).glyph()
    font['glyf'].glyphOrder = font.getGlyphOrder()
    font['hmtx'].metrics['uniFE0F'] = (0, 0)
    for table in font['cmap'].tables:
        table.cmap[0xFE0F] = 'uniFE0F'
    # A mark, which the ligature lookups then skip.
    addOpenTypeFeaturesFromString(font, 'table GDEF { GlyphClassDef , , [uniFE0F], ; } GDEF;', tables={'GDEF'})
    for lookup in font['GSUB'].table.LookupList.Lookup:
        lookup.LookupFlag |= LOOKUP_FLAG_IGNORE_MARKS


main()
