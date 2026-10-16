import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error ico-endec ships no type declarations
import icoEndec from 'ico-endec';
// @ts-expect-error opentype.js ships no type declarations
import opentype from 'opentype.js';
import sharp from 'sharp';
import { parse } from 'yaml';

type Tower = {
  height: number;
  top: number;
  fill: string;
  opacity?: number;
};
type Text = {
  content: string;
  font: string;
  fontSize: number;
  letterSpacing: number;
  baselineFromBottom: number;
  fill: string;
  opacity?: number;
};
type Icon = {
  files: string[];
  canvas?: number;
  clip?: 'circle';
  background?: string;
  tower?: Tower;
  text?: Text;
} & ({ size: number | `${number}x${number}` } | { sizes: number[] });
type Variant = {
  suffix: string;
  accent: string;
  'white-on-accent': { opacity: number };
};

const repoRoot = join(import.meta.dirname, '../..');
const { dirs, variants, icons } = parse(
  readFileSync(join(import.meta.dirname, 'icons.yaml'), 'utf8'),
  { merge: true },
) as {
  dirs: Record<string, string>;
  variants: Record<string, Variant>;
  icons: Icon[];
};
const lighthouseSvg = readFileSync(
  join(import.meta.dirname, 'src/harbor-lighthouse.svg'),
  'utf8',
);
const lighthouseViewBox = readSvgAttribute(lighthouseSvg, 'viewBox');
const lighthousePathData = readSvgAttribute(lighthouseSvg, 'd');

for (const icon of icons) {
  // Files named with {suffix} get one copy per variant, the rest production's
  const iconVariants = icon.files.some((file) => file.includes('{suffix}'))
    ? Object.values(variants)
    : [variants.production];
  for (const variant of iconVariants) {
    await writeIcon(buildVariantIcon(icon, variant));
  }
}

async function writeIcon(icon: Icon) {
  const paths = icon.files.map((file) =>
    join(
      repoRoot,
      file.replace(/^\$(\w+)/, (_, name) => dirs[name]),
    ),
  );
  if ('size' in icon && paths.every((path) => path.endsWith('.icon'))) {
    for (const path of paths)
      await writeIconComposerBundle(icon, icon.size, path);
    return;
  }
  const image =
    'sizes' in icon
      ? icoEndec.encode(
          await Promise.all(icon.sizes.map((size) => renderPng(icon, size))),
        )
      : await renderPng(icon, icon.size);
  for (const path of paths) writeFileSync(path, image);
}

function buildVariantIcon(icon: Icon, variant: Variant): Icon {
  return {
    ...icon,
    files: icon.files.map((file) => file.replace('{suffix}', variant.suffix)),
    background: icon.background && resolveColor(icon.background, variant),
    tower: icon.tower && {
      ...icon.tower,
      fill: resolveColor(icon.tower.fill, variant),
    },
    text: icon.text && {
      ...icon.text,
      fill: resolveColor(icon.text.fill, variant),
    },
  };
}

function resolveColor(color: string, variant: Variant): string {
  if (color === 'accent') return variant.accent;
  if (color !== 'white-on-accent') return color;
  // White at the opacity over the accent, made opaque
  const { opacity } = variant['white-on-accent'];
  const channels = [1, 3, 5].map((start) =>
    Math.round(
      opacity * 255 +
        (1 - opacity) *
          Number.parseInt(variant.accent.slice(start, start + 2), 16),
    )
      .toString(16)
      .padStart(2, '0')
      .toUpperCase(),
  );
  return `#${channels.join('')}`;
}

// An Icon Composer bundle: the background becomes its fill and the whole tower
// a layer moved into place, from which Xcode renders the Liquid Glass. Canvas
// units are points, and the layer is rendered at 1 px per point.
async function writeIconComposerBundle(
  icon: Icon,
  size: number | string,
  path: string,
) {
  const { background, tower } = icon;
  if (!background || !tower) {
    throw new Error(`${path} needs a background and a tower`);
  }
  const [width] = String(size).split('x').map(Number);
  const canvas = icon.canvas ?? width;
  const [, , viewBoxWidth, viewBoxHeight] = lighthouseViewBox
    .split(' ')
    .map(Number);
  const towerWidth = Math.ceil((tower.height * viewBoxWidth) / viewBoxHeight);
  rmSync(path, { recursive: true, force: true });
  mkdirSync(join(path, 'Assets'), { recursive: true });
  writeFileSync(
    join(path, 'Assets/tower.png'),
    await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${towerWidth}" height="${tower.height}">${buildTower(towerWidth, { ...tower, top: 0 })}</svg>`,
      ),
    )
      .png()
      .toBuffer(),
  );
  const backgroundFill = { solid: buildIconComposerColor(background) };
  const iconJson = {
    fill: backgroundFill,
    groups: [
      {
        layers: [
          {
            // In dark mode the tower takes the background's colour
            'fill-specializations': [
              { appearance: 'dark', value: backgroundFill },
            ],
            'image-name': 'tower.png',
            name: 'tower',
            // Layers start centred on the canvas
            position: {
              scale: 1,
              'translation-in-points': [
                0,
                tower.top + tower.height / 2 - canvas / 2,
              ],
            },
          },
        ],
        shadow: { kind: 'neutral', opacity: 0.5 },
        translucency: { enabled: true, value: 0.3 },
      },
    ],
    'supported-platforms': { circles: ['watchOS'], squares: 'shared' },
  };
  writeFileSync(
    join(path, 'icon.json'),
    `${JSON.stringify(iconJson, null, 2)}\n`,
  );
}

// '#FF6A00' -> 'srgb:1.00000,0.41569,0.00000,1.00000'
function buildIconComposerColor(hex: string): string {
  const channels = [1, 3, 5].map((start) =>
    (Number.parseInt(hex.slice(start, start + 2), 16) / 255).toFixed(5),
  );
  return `srgb:${channels.join(',')},1.00000`;
}

function renderPng(icon: Icon, size: number | string): Promise<Buffer> {
  return sharp(Buffer.from(buildIconSvg(icon, size)))
    .png()
    .toBuffer();
}

function buildIconSvg(icon: Icon, size: number | string): string {
  const [width, height = width] = String(size).split('x').map(Number);
  const canvas = icon.canvas ?? width;
  const canvasHeight = (canvas * height) / width;
  let content =
    (icon.background
      ? `<rect width="${canvas}" height="${canvasHeight}" fill="${icon.background}"/>`
      : '') +
    (icon.tower ? buildTower(canvas, icon.tower) : '') +
    (icon.text ? buildText(canvas, canvasHeight, icon.text) : '');
  if (icon.clip === 'circle') {
    const radius = canvas / 2;
    content =
      `<clipPath id="circle"><circle cx="${radius}" cy="${radius}" r="${radius}"/></clipPath>` +
      `<g clip-path="url(#circle)">${content}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${canvas} ${canvasHeight}">${content}</svg>`;
}

function buildTower(
  canvas: number,
  { height, top, fill, opacity = 1 }: Tower,
): string {
  // The viewBox fits the tower exactly, so the default preserveAspectRatio centres it
  return `<svg y="${top}" width="${canvas}" height="${height}" viewBox="${lighthouseViewBox}"><path fill="${fill}" fill-opacity="${opacity}" d="${lighthousePathData}"/></svg>`;
}

function buildText(
  canvas: number,
  canvasHeight: number,
  {
    content,
    font,
    fontSize,
    letterSpacing,
    baselineFromBottom,
    fill,
    opacity = 1,
  }: Text,
): string {
  const parsedFont = opentype.parse(
    new Uint8Array(readFileSync(join(repoRoot, font))).buffer,
  );
  const textPath = parsedFont.getPath(
    content,
    0,
    canvasHeight - baselineFromBottom,
    fontSize,
    { letterSpacing },
  );
  // Centres the letters themselves, not their advance widths
  const textBounds = textPath.getBoundingBox();
  const textX = (canvas - textBounds.x1 - textBounds.x2) / 2;
  return `<path fill="${fill}" fill-opacity="${opacity}" transform="translate(${textX} 0)" d="${textPath.toPathData(2)}"/>`;
}

function readSvgAttribute(svg: string, name: string): string {
  const value = svg.match(new RegExp(` ${name}="([^"]+)"`))?.[1];
  if (!value) throw new Error(`No ${name} in harbor-lighthouse.svg`);
  return value;
}
