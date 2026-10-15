import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error ico-endec ships no type declarations
import icoEndec from 'ico-endec';
// @ts-expect-error opentype.js ships no type declarations
import opentype from 'opentype.js';
import sharp from 'sharp';
import { parse } from 'yaml';

type Tower = { height: number; top: number; fill: string; opacity?: number };
type Text = {
  content: string;
  font: string;
  fontSize: number;
  letterSpacing: number;
  baselineFromBottom: number;
  fill: string;
};
type Icon = {
  files: string[];
  canvas?: number;
  clip?: 'circle';
  background?: string;
  tower?: Tower;
  text?: Text;
} & ({ size: number } | { sizes: number[] });

const repoRoot = join(import.meta.dirname, '../..');
const { dirs, icons } = parse(
  readFileSync(join(import.meta.dirname, 'icons.yaml'), 'utf8'),
  { merge: true },
) as { dirs: Record<string, string>; icons: Icon[] };
const lighthouseSvg = readFileSync(
  join(import.meta.dirname, 'src/harbor-lighthouse.svg'),
  'utf8',
);
const lighthouseViewBox = readSvgAttribute(lighthouseSvg, 'viewBox');
const lighthousePathData = readSvgAttribute(lighthouseSvg, 'd');

for (const icon of icons) {
  const image =
    'sizes' in icon
      ? icoEndec.encode(
          await Promise.all(icon.sizes.map((size) => renderPng(icon, size))),
        )
      : await renderPng(icon, icon.size);
  for (const file of icon.files) {
    const path = file.replace(/^\$(\w+)/, (_, name) => dirs[name]);
    writeFileSync(join(repoRoot, path), image);
  }
}

function renderPng(icon: Icon, size: number): Promise<Buffer> {
  return sharp(Buffer.from(buildIconSvg(icon, size)))
    .png()
    .toBuffer();
}

function buildIconSvg(icon: Icon, size: number): string {
  const canvas = icon.canvas ?? size;
  let content =
    (icon.background
      ? `<rect width="${canvas}" height="${canvas}" fill="${icon.background}"/>`
      : '') +
    (icon.tower ? buildTower(canvas, icon.tower) : '') +
    (icon.text ? buildText(canvas, icon.text) : '');
  if (icon.clip === 'circle') {
    const radius = canvas / 2;
    content =
      `<clipPath id="circle"><circle cx="${radius}" cy="${radius}" r="${radius}"/></clipPath>` +
      `<g clip-path="url(#circle)">${content}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${canvas} ${canvas}">${content}</svg>`;
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
  { content, font, fontSize, letterSpacing, baselineFromBottom, fill }: Text,
): string {
  const parsedFont = opentype.parse(
    new Uint8Array(readFileSync(join(repoRoot, font))).buffer,
  );
  const textPath = parsedFont.getPath(
    content,
    0,
    canvas - baselineFromBottom,
    fontSize,
    { letterSpacing },
  );
  // Centres the letters themselves, not their advance widths
  const textBounds = textPath.getBoundingBox();
  const textX = (canvas - textBounds.x1 - textBounds.x2) / 2;
  return `<path fill="${fill}" transform="translate(${textX} 0)" d="${textPath.toPathData(2)}"/>`;
}

function readSvgAttribute(svg: string, name: string): string {
  const value = svg.match(new RegExp(` ${name}="([^"]+)"`))?.[1];
  if (!value) throw new Error(`No ${name} in harbor-lighthouse.svg`);
  return value;
}
