// Renders the store screenshots with the local Chrome.
//
//   node apps/harbor-browser-extension/marketing/source/render.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  esc,
  palette,
  screenCss,
} from '../../../harbor/marketing/source/screens.mjs';
import { slides } from './data.mjs';
import {
  PAGE_WIDTH,
  PANEL_WIDTH,
  renderWindow,
  windowCss,
} from './screens.mjs';

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

// The Chrome Web Store and Edge Add-ons size.
const target = { dir: 'web-store', W: 1280, H: 800 };

// As in apps/harbor/marketing/source/render.mjs
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

function slideHtml(slide, t) {
  const th = themes[slide.theme];
  const pad = Math.round(t.W * 0.07);
  const top = Math.round(t.H * 0.2);
  const bottom = Math.round(t.H * 0.04);
  const zoom = (t.W - 2 * pad) / (PAGE_WIDTH + PANEL_WIDTH);
  const windowHeight = Math.round((t.H - top - bottom) / zoom);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${screenCss}
${windowCss}
html,body{margin:0;background:${th.bg}}
.canvas{width:${t.W}px;height:${t.H}px;overflow:hidden;position:relative;background:${th.bg};font-family:'Noto Sans',sans-serif}
.glow{position:absolute;inset:0;background:${th.glow}}
.copy{position:absolute;left:${pad}px;right:${pad}px;top:${Math.round(t.H * 0.04)}px;text-align:center}
h1{font-size:${Math.round(t.W * 0.034)}px;line-height:1.1;font-weight:700;letter-spacing:-.02em;color:${th.fg}}
.copy p{font-size:${Math.round(t.W * 0.0156)}px;line-height:1.35;color:${th.sub};margin-top:${Math.round(t.H * 0.012)}px}
.frame{position:absolute;left:${pad}px;top:${top}px;transform:scale(${zoom});transform-origin:top left;border-radius:12px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.32)}
</style></head><body><div class="canvas"><div class="glow"></div>
<div class="copy"><h1>${esc(slide.headline)}</h1><p>${esc(slide.sub)}</p></div>
<div class="frame">${renderWindow(slide.panel, windowHeight)}</div>
</div></body></html>`;
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

const tmpDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'harbor-extension-marketing-'),
);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
const dir = path.join(outRoot, 'screenshots', target.dir);
fs.mkdirSync(dir, { recursive: true });
for (const slide of slides) {
  await shoot(
    page,
    slideHtml(slide, target),
    path.join(dir, `${slide.id}.png`),
    target.W,
    target.H,
  );
}
await browser.close();
fs.rmSync(tmpDir, { recursive: true, force: true });
