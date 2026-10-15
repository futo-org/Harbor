import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error ico-endec ships no type declarations
import icoEndec from 'ico-endec';
// @ts-expect-error opentype.js ships no type declarations
import opentype from 'opentype.js';
import sharp from 'sharp';

const ORANGE = '#FF6A00';
const WHITE_TOWER_FILL = 'fill="#FFFFFF" fill-opacity="0.9"';
// The tower is always centred horizontally; top is its distance from the canvas top
const IOS_TOWER = { height: 929, top: 143 };
const ANDROID_TOWER = { height: 187, top: 162 };
const FAVICON_SIZES = [48, 32, 16];
// From the Figma design: the tower is top-aligned and centred, the text is centred
const LOGO_WITH_TEXT = {
  size: 857,
  towerHeight: 608,
  fontSize: 180,
  letterSpacing: 0.05, //em
  textBaselineFromBottom: 14,
};

const repoRoot = join(import.meta.dirname, '../..');
const appIconsDir = join(
  repoRoot,
  'apps/harbor/src/common/assets/images/app-icons',
);
const appImagesDir = join(repoRoot, 'apps/harbor/src/common/assets/images');
const docsImagesDir = join(repoRoot, 'docs/static/img');
const lighthouseSvg = readFileSync(
  join(import.meta.dirname, 'src/harbor-lighthouse.svg'),
  'utf8',
);
const lighthouseViewBox = readSvgAttribute(lighthouseSvg, 'viewBox');
const lighthousePathData = readSvgAttribute(lighthouseSvg, 'd');

const iosIconSvg = buildSvg(
  1024,
  1024,
  buildBackground(1024) + buildTower(1024, IOS_TOWER, WHITE_TOWER_FILL),
);
await writePng(iosIconSvg, join(appIconsDir, 'ios-icon-default.png'));
await writePng(iosIconSvg, join(appIconsDir, 'ios-icon-dark.png'));
await writePng(
  buildSvg(1024, 1024, buildTower(1024, IOS_TOWER, `fill="${ORANGE}"`)),
  join(appIconsDir, 'ios-icon-monochrome.png'),
);

await writePng(
  buildSvg(512, 512, buildBackground(512)),
  join(appIconsDir, 'android-icon-background.png'),
);
await writePng(
  buildAndroidTowerSvg(WHITE_TOWER_FILL),
  join(appIconsDir, 'android-icon-foreground.png'),
);
// The launcher only uses this layer's shape, so the colour is arbitrary
await writePng(
  buildAndroidTowerSvg('fill="#354479"'),
  join(appIconsDir, 'android-icon-monochrome.png'),
);

for (const path of [
  join(appImagesDir, 'harbor-logo-256.png'),
  join(docsImagesDir, 'logo.png'),
  join(docsImagesDir, 'logo-dark.png'),
]) {
  await writePng(buildCircleLogoSvg(256), path);
}

const faviconPngs = await Promise.all(
  FAVICON_SIZES.map((size) =>
    sharp(Buffer.from(buildCircleLogoSvg(size)))
      .png()
      .toBuffer(),
  ),
);
const favicon = icoEndec.encode(faviconPngs);
writeFileSync(join(repoRoot, 'apps/harbor/public/favicon.ico'), favicon);
writeFileSync(join(docsImagesDir, 'favicon.ico'), favicon);

for (const path of [
  join(appImagesDir, 'harbor-logo-with-text.png'),
  join(docsImagesDir, 'harbor-logo-with-text.png'),
]) {
  await writePng(buildLogoWithTextSvg(), path);
}

function buildLogoWithTextSvg(): string {
  const { size, towerHeight, fontSize, letterSpacing, textBaselineFromBottom } =
    LOGO_WITH_TEXT;
  const font = opentype.parse(
    new Uint8Array(
      readFileSync(join(import.meta.dirname, 'fonts/OpenSans-ExtraBold.ttf')),
    ).buffer,
  );
  const textPath = font.getPath(
    'HARBOR',
    0,
    size - textBaselineFromBottom,
    fontSize,
    { letterSpacing },
  );
  // Centres the letters themselves, not their advance widths
  const textBounds = textPath.getBoundingBox();
  const textX = (size - textBounds.x1 - textBounds.x2) / 2;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    buildTower(size, { height: towerHeight, top: 0 }, WHITE_TOWER_FILL) +
    `<path fill="#FFFFFF" transform="translate(${textX} 0)" d="${textPath.toPathData(2)}"/>` +
    '</svg>'
  );
}

function buildCircleLogoSvg(size: number): string {
  return buildSvg(
    size,
    1024,
    '<clipPath id="circle"><circle cx="512" cy="512" r="512"/></clipPath>' +
      `<g clip-path="url(#circle)">${buildBackground(1024)}${buildTower(1024, IOS_TOWER, WHITE_TOWER_FILL)}</g>`,
  );
}

function buildAndroidTowerSvg(fillAttributes: string): string {
  return buildSvg(512, 512, buildTower(512, ANDROID_TOWER, fillAttributes));
}

function buildSvg(size: number, viewBoxSize: number, content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}">${content}</svg>`;
}

function buildBackground(size: number): string {
  return `<rect width="${size}" height="${size}" fill="${ORANGE}"/>`;
}

function buildTower(
  canvasSize: number,
  { height, top }: { height: number; top: number },
  fillAttributes: string,
): string {
  // The viewBox fits the tower exactly, so the default preserveAspectRatio centres it
  return `<svg y="${top}" width="${canvasSize}" height="${height}" viewBox="${lighthouseViewBox}"><path ${fillAttributes} d="${lighthousePathData}"/></svg>`;
}

async function writePng(svg: string, path: string): Promise<void> {
  await sharp(Buffer.from(svg)).png().toFile(path);
}

function readSvgAttribute(svg: string, name: string): string {
  const value = svg.match(new RegExp(` ${name}="([^"]+)"`))?.[1];
  if (!value) throw new Error(`No ${name} in harbor-lighthouse.svg`);
  return value;
}
