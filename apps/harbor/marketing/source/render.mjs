// Renders the store screenshots, feature graphic and icons with the local Chrome.
//
//   node apps/harbor/marketing/source/render.mjs [iphone-6.9|ipad-13|android-phone|android-tablet-10|graphics]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slides } from './data.mjs';
import { assetsDir, palette, renderScreen, screenCss } from './screens.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');
const outRoot = path.resolve(here, '..');

const pnpm = path.join(repoRoot, 'node_modules', '.pnpm');
const pwDir = fs.readdirSync(pnpm).find((d) => /^playwright@/.test(d));
if (!pwDir)
  throw new Error('Playwright not found in node_modules; run pnpm install');
const { chromium } = await import(
  path.join(pnpm, pwDir, 'node_modules', 'playwright', 'index.mjs')
);

const targets = [
  {
    dir: 'iphone-6.9',
    W: 1320,
    H: 2868,
    platform: 'ios',
    form: 'phone',
    logical: [393, 852],
    fit: 'full',
  },
  {
    dir: 'ipad-13',
    W: 2064,
    H: 2752,
    platform: 'ios',
    form: 'tablet',
    logical: [1032, 1376],
  },
  {
    dir: 'android-phone',
    W: 1080,
    H: 1920,
    platform: 'android',
    form: 'phone',
    logical: [412, 915],
  },
  {
    dir: 'android-tablet-10',
    W: 1600,
    H: 2560,
    platform: 'android',
    form: 'tablet',
    logical: [800, 1280],
  },
];

const themes = {
  orange: {
    bg: palette.primary,
    fg: '#FFFFFF',
    sub: 'rgba(255,255,255,.84)',
    glow: 'radial-gradient(70% 45% at 50% 100%, rgba(255,192,73,.45), transparent 70%)',
  },
  dark: {
    bg: palette.dark,
    fg: '#FFFFFF',
    sub: '#A9AAAC',
    glow: 'radial-gradient(70% 45% at 50% 100%, rgba(255,106,0,.38), transparent 70%)',
  },
  light: {
    bg: palette.n25,
    fg: palette.n900,
    sub: palette.n600,
    glow: 'radial-gradient(70% 45% at 50% 100%, rgba(255,106,0,.18), transparent 70%)',
  },
};

function layout(t) {
  const phone = t.form === 'phone';
  const pad = Math.round(t.W * (phone ? 0.075 : 0.07));
  const h1 = Math.round(t.W * (phone ? 0.0695 : 0.05));
  const sub = Math.round(h1 * (phone ? 0.56 : 0.44));
  const copyTop = Math.round(pad * 1.25);
  const frameTop = phone
    ? copyTop +
      Math.round(2 * h1 * 1.08 + sub * 0.6 + 3 * sub * 1.32 + pad * 0.3)
    : Math.round(t.H * 0.225);
  let frameW = Math.round(t.W * (phone ? 0.86 : 0.76));
  let bezel = Math.round(frameW * (phone ? 0.016 : 0.014));
  if (t.fit === 'full') {
    const fitZoom = (t.H - frameTop - pad * 0.6 - 2 * bezel) / t.logical[1];
    frameW = Math.min(frameW, Math.round(t.logical[0] * fitZoom + 2 * bezel));
    bezel = Math.round(frameW * 0.016);
  }
  const radius = Math.round(frameW * (phone ? 0.135 : 0.05));
  const zoom = (frameW - 2 * bezel) / t.logical[0];
  return { pad, h1, sub, frameW, bezel, radius, frameTop, copyTop, zoom };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function slideHtml(slide, t) {
  const th = themes[slide.theme];
  const L = layout(t);
  const [lw, lh] = t.logical;
  const screen = renderScreen(slide.screen, t);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${screenCss}
html,body{margin:0;background:${th.bg}}
.canvas{width:${t.W}px;height:${t.H}px;overflow:hidden;position:relative;background:${th.bg};font-family:'Noto Sans',sans-serif}
.glow{position:absolute;inset:0;background:${th.glow}}
.copy{position:absolute;left:${L.pad}px;right:${L.pad}px;top:${L.copyTop}px}
h1{font-size:${L.h1}px;line-height:1.08;font-weight:700;letter-spacing:-.02em;color:${th.fg};text-wrap:balance}
p{font-size:${L.sub}px;line-height:1.32;color:${th.sub};margin-top:${Math.round(L.sub * 0.6)}px;text-wrap:pretty}
.device{position:absolute;top:${L.frameTop}px;left:50%;transform:translateX(-50%);width:${L.frameW}px;padding:${L.bezel}px;background:#0b0c10;border-radius:${L.radius}px;box-shadow:0 ${Math.round(L.pad * 0.4)}px ${Math.round(L.pad * 1.4)}px rgba(0,0,0,.38),0 0 0 1px rgba(255,255,255,.08) inset}
.inner{width:${Math.round(lw * L.zoom)}px;height:${Math.round(lh * L.zoom)}px;border-radius:${L.radius - L.bezel}px;overflow:hidden;background:#fff;position:relative}
.inner>.screen{transform:scale(${L.zoom});transform-origin:top left}
</style></head><body><div class="canvas"><div class="glow"></div>
<div class="copy"><h1>${esc(slide.headline)}</h1><p>${esc(slide.sub)}</p></div>
<div class="device"><div class="inner">${screen}</div></div>
</div></body></html>`;
}

function featureGraphicHtml() {
  const logo = path.join(assetsDir, 'images', 'harbor-logo-with-text.png');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${screenCss}
html,body{margin:0}.canvas{width:1024px;height:500px;background:${palette.primary};position:relative;overflow:hidden;font-family:'Noto Sans',sans-serif;display:flex;align-items:center;padding:0 64px;gap:40px}
.glow{position:absolute;inset:0;background:radial-gradient(60% 80% at 20% 50%, rgba(255,192,73,.5), transparent 70%)}
h1{font-size:50px;line-height:1.1;font-weight:700;letter-spacing:-.02em;color:#fff;position:relative}
p{font-size:23px;line-height:1.35;color:rgba(255,255,255,.86);margin-top:14px;position:relative}
</style></head><body><div class="canvas"><div class="glow"></div><img src="file://${logo}" style="height:400px;position:relative"><div><h1>Share to the world, not platforms.</h1><p>You hold the keys, and your posts go to every server you choose. Open source, built on the Polycentric Protocol.</p></div></div></body></html>`;
}

function phoneHtml(screen, zoom, style) {
  const t = { platform: 'ios', form: 'phone', logical: [393, 852] };
  const bezel = 14;
  const w = t.logical[0] + 2 * bezel;
  const h = t.logical[1] + 2 * bezel;
  return `<div style="position:absolute;width:${w}px;height:${h}px;transform-origin:top left;${style}transform:scale(${zoom}) ${style.includes('--rot') ? '' : ''}">
    <div class="device" style="position:absolute;inset:0;width:${w}px;padding:${bezel}px;border-radius:62px;background:#0b0c10;box-shadow:0 40px 90px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.08) inset">
      <div style="width:${t.logical[0]}px;height:${t.logical[1]}px;border-radius:48px;overflow:hidden;background:#fff">${renderScreen(screen, t)}</div>
    </div></div>`;
}

function creativeAssetHtml(W, H, { tall }) {
  const logo = path.join(assetsDir, 'images', 'harbor-logo-with-text.png');
  const logoH = Math.round(H * (tall ? 0.3 : 0.32));
  const h1 = Math.round(W * (tall ? 0.04 : 0.032));
  const left = Math.round(W * 0.07);
  const zoom = tall ? 2.3 : 1.75;
  const phoneW = 421 * zoom;
  const phoneH = 880 * zoom;
  const frontX = Math.round(W - left - phoneW);
  const frontY = tall
    ? Math.round((H - phoneH) / 2 + H * 0.06)
    : Math.round(H * 0.12);
  const backX = Math.round(frontX - phoneW * 0.62);
  const backY = tall
    ? frontY + Math.round(H * 0.1)
    : frontY + Math.round(H * 0.14);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${screenCss}
html,body{margin:0}
.canvas{width:${W}px;height:${H}px;background:${palette.primary};position:relative;overflow:hidden;font-family:'Noto Sans',sans-serif}
.glow{position:absolute;inset:0;background:radial-gradient(60% 80% at 22% 50%, rgba(255,192,73,.5), transparent 70%)}
.copy{position:absolute;left:${left}px;top:0;height:${H}px;width:${Math.round(W * 0.42)}px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:${Math.round(H * 0.06)}px}
h1{font-size:${h1}px;line-height:1.1;font-weight:700;letter-spacing:-.02em;color:#fff;text-wrap:balance}
p{font-size:${Math.round(h1 * 0.48)}px;line-height:1.35;color:rgba(255,255,255,.86);margin-top:${Math.round(h1 * 0.3)}px}
</style></head><body><div class="canvas"><div class="glow"></div>
<div class="copy"><img src="file://${logo}" style="height:${logoH}px"><div><h1>Share to the world, not platforms.</h1><p>You hold the keys, and your posts go to every server you choose.</p></div></div>
${phoneHtml('post', zoom * 0.92, `left:${backX}px;top:${backY}px;opacity:.96;`)}
${phoneHtml('feed', zoom, `left:${frontX}px;top:${frontY}px;`)}
</div></body></html>`;
}

function iconHtml(size) {
  const tower = path.join(
    assetsDir,
    'images',
    'app-icons',
    'ios-icon.icon',
    'Assets',
    'tower.png',
  );
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}.canvas{width:${size}px;height:${size}px;background:${palette.primary};display:flex;align-items:center;justify-content:center}img{height:${Math.round(size * 0.6)}px;opacity:.92}</style></head><body><div class="canvas"><img src="file://${tower}"></div></body></html>`;
}

async function shoot(page, html, file, W, H) {
  const tmp = path.join(tmpDir, `${path.basename(file, '.png')}.html`);
  fs.writeFileSync(tmp, html);
  await page.setViewportSize({ width: W, height: H });
  await page.goto(`file://${tmp}`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: file,
    clip: { x: 0, y: 0, width: W, height: H },
  });
  console.log(path.relative(outRoot, file));
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-marketing-'));
const only = process.argv[2];
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const t of targets) {
  if (only && only !== t.dir) continue;
  const dir = path.join(outRoot, 'screenshots', t.dir);
  fs.mkdirSync(dir, { recursive: true });
  for (const slide of slides) {
    await shoot(
      page,
      slideHtml(slide, t),
      path.join(dir, `${slide.id}.png`),
      t.W,
      t.H,
    );
  }
}
if (!only || only === 'graphics') {
  fs.mkdirSync(path.join(outRoot, 'icons'), { recursive: true });
  await shoot(
    page,
    featureGraphicHtml(),
    path.join(outRoot, 'screenshots', 'android-feature-graphic.png'),
    1024,
    500,
  );
  await shoot(
    page,
    creativeAssetHtml(3840, 1646, { tall: false }),
    path.join(outRoot, 'screenshots', 'app-store-header.png'),
    3840,
    1646,
  );
  await shoot(
    page,
    creativeAssetHtml(3840, 2560, { tall: true }),
    path.join(outRoot, 'screenshots', 'app-store-search.png'),
    3840,
    2560,
  );
  await shoot(
    page,
    iconHtml(1024),
    path.join(outRoot, 'icons', 'app-store-icon-1024.png'),
    1024,
    1024,
  );
  await shoot(
    page,
    iconHtml(512),
    path.join(outRoot, 'icons', 'play-store-icon-512.png'),
    512,
    512,
  );
}
await browser.close();
fs.rmSync(tmpDir, { recursive: true, force: true });
