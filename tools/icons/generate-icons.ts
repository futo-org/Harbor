import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error ico-endec ships no type declarations
import icoEndec from 'ico-endec';
import sharp from 'sharp';

const ORANGE = '#FF6A00';
const CREAM = '#FFF0E5';
// Places the tower on the 512 canvas the same way the previous hand-made Android export did
const ANDROID_TOWER_TRANSFORM = 'translate(152.8 133.6) scale(0.2016)';
const FAVICON_SIZES = [48, 32, 16];

const repoRoot = join(import.meta.dirname, '../..');
const appIconsDir = join(
  repoRoot,
  'apps/harbor/src/common/assets/images/app-icons',
);
const appImagesDir = join(repoRoot, 'apps/harbor/src/common/assets/images');
const docsImagesDir = join(repoRoot, 'docs/static/img');
const lighthousePathData = readLighthousePathData();

const iosIconSvg = buildSvg(
  1024,
  1024,
  buildBackground(1024) + buildLighthouse(`fill="${CREAM}"`),
);
await writePng(iosIconSvg, join(appIconsDir, 'ios-icon-default.png'));
await writePng(iosIconSvg, join(appIconsDir, 'ios-icon-dark.png'));
await writePng(
  buildSvg(1024, 1024, buildLighthouse(`fill="${ORANGE}"`)),
  join(appIconsDir, 'ios-icon-monochrome.png'),
);

await writePng(
  buildSvg(512, 512, buildBackground(512)),
  join(appIconsDir, 'android-icon-background.png'),
);
await writePng(
  buildAndroidTowerSvg(`fill="#FFFFFF" fill-opacity="${229 / 255}"`),
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

function buildCircleLogoSvg(size: number): string {
  return buildSvg(
    size,
    1024,
    '<clipPath id="circle"><circle cx="512" cy="512" r="512"/></clipPath>' +
      `<g clip-path="url(#circle)">${buildBackground(1024)}${buildLighthouse(`fill="${CREAM}"`)}</g>`,
  );
}

function buildAndroidTowerSvg(fillAttributes: string): string {
  return buildSvg(
    512,
    512,
    `<g transform="${ANDROID_TOWER_TRANSFORM}">${buildLighthouse(fillAttributes)}</g>`,
  );
}

function buildSvg(size: number, viewBoxSize: number, content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}">${content}</svg>`;
}

function buildBackground(size: number): string {
  return `<rect width="${size}" height="${size}" fill="${ORANGE}"/>`;
}

function buildLighthouse(fillAttributes: string): string {
  return `<path ${fillAttributes} d="${lighthousePathData}"/>`;
}

async function writePng(svg: string, path: string): Promise<void> {
  await sharp(Buffer.from(svg)).png().toFile(path);
}

function readLighthousePathData(): string {
  const svg = readFileSync(
    join(import.meta.dirname, 'src/harbor-lighthouse.svg'),
    'utf8',
  );
  const pathData = svg.match(/<path id="lighthouse" d="([^"]+)"/)?.[1];
  if (!pathData) throw new Error('No lighthouse path in harbor-lighthouse.svg');
  return pathData;
}
