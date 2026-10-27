// App screen mockups as HTML at logical pixel size.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  claims,
  moderationLabels,
  notifications,
  people,
  posts,
  replies,
  servers,
  verifiedPlatforms,
} from './data.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..', '..');
export const assetsDir = path.join(appDir, 'src', 'common', 'assets');
export const photosDir = path.join(here, 'assets', 'photos');

const vectorIcons = path.dirname(
  require.resolve('@expo/vector-icons/package.json'),
);
const vendor = path.join(
  vectorIcons,
  'build',
  'vendor',
  'react-native-vector-icons',
);
const glyphs = {
  ion: require(path.join(vendor, 'glyphmaps', 'Ionicons.json')),
  mci: require(path.join(vendor, 'glyphmaps', 'MaterialCommunityIcons.json')),
  mi: require(path.join(vendor, 'glyphmaps', 'MaterialIcons.json')),
};
const brands = require('@fortawesome/free-brands-svg-icons');
const solid = require('@fortawesome/free-solid-svg-icons');

export const palette = {
  n0: '#FFFFFF',
  n25: '#F2F5F9',
  n50: '#E8EDF5',
  n100: '#DDE3EE',
  n200: '#CDD5E4',
  n500: '#7C869D',
  n600: '#5F6B7F',
  n900: '#1A1F29',
  dark: '#0D1016',
  primary: '#FF6A00',
  primary100: '#FFA05C',
  primary300: '#FF8833',
  primary800: '#CC5500',
  positive25: '#E8F5E8',
  positive300: '#47AC47',
  positive600: '#006E00',
  negative: '#D9314D',
  warning500: '#E59400',
};

function fontFace(family, file, weight = 400) {
  return `@font-face{font-family:'${family}';src:url('file://${file}');font-weight:${weight};font-display:block}`;
}

export const fontsCss = [
  fontFace(
    'Noto Sans',
    path.join(assetsDir, 'fonts', 'NotoSans-Regular.ttf'),
    400,
  ),
  fontFace(
    'Noto Sans',
    path.join(assetsDir, 'fonts', 'NotoSans-SemiBold.ttf'),
    600,
  ),
  fontFace(
    'Noto Sans',
    path.join(assetsDir, 'fonts', 'NotoSans-Bold.ttf'),
    700,
  ),
  fontFace(
    'Noto Sans Mono',
    path.join(assetsDir, 'fonts', 'NotoSansMono-Regular.ttf'),
    400,
  ),
  fontFace('Twemoji', path.join(assetsDir, 'fonts', 'Twemoji.ttf')),
  fontFace('Ionicons', path.join(vendor, 'Fonts', 'Ionicons.ttf')),
  fontFace(
    'MaterialCommunityIcons',
    path.join(vendor, 'Fonts', 'MaterialCommunityIcons.ttf'),
  ),
  fontFace('MaterialIcons', path.join(vendor, 'Fonts', 'MaterialIcons.ttf')),
].join('\n');

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function icon(set, name, size = 24, color = palette.n900) {
  const code = glyphs[set][name];
  if (code === undefined) throw new Error(`Unknown ${set} icon ${name}`);
  return `<span class="ic ${set}" style="font-size:${size}px;width:${size}px;height:${size}px;color:${color}">&#${code};</span>`;
}
const ion = (n, s, c) => icon('ion', n, s, c);
const mci = (n, s, c) => icon('mci', n, s, c);
const mi = (n, s, c) => icon('mi', n, s, c);

// From src/common/components/HarborSvg.tsx
const HARBOR_GLYPHS = {
  reactionOutline: [
    'M12 5.3C13 3.5 15 2.3 17 2.3C20.5 2.3 23 4.9 23 8.1C23 12.5 15.5 21.7 12 21.7C8.5 21.7 1 12.5 1 8.1C1 4.9 3.5 2.3 7 2.3C9 2.3 11 3.5 12 5.3Z',
  ],
  reply: [
    'M1 11.4a10.2 10.2 0 0 0 1.1 4.6 10.4 10.4 0 0 0 9.3 5.7 10.2 10.2 0 0 0 4.6-1.1L22 22.7q1.2.5.7-.7L20.7 16a10.2 10.2 0 0 0 1.1-4.6 10.4 10.4 0 0 0-5.7-9.3 10.2 10.2 0 0 0-4.6-1.1h-.6a10.4 10.4 0 0 0-9.8 9.8v.6z',
  ],
  repost: [
    'M1 8.65l3.3-3.3q.7-.7 1.4 0L9 8.65',
    'M12 19h-3a4 4 0 0 1-4-4V5.4',
    'M23 15.35l-3.3 3.3q-.7.7-1.4 0L15 15.35',
    'M12 5h3a4 4 0 0 1 4 4v9.6',
  ],
  share: [
    'M13.92 3.04L21.86 10.88Q23 12 21.86 13.12L13.92 20.96Q12.79 22.08 12.79 20.48V16.7Q12.79 15.8 11.89 15.8C7.68 16.06 5.19 18.61 2.03 21.03Q1 21.82 1.1 20.52C1.52 14.75 4.93 8.6 11.89 8.2Q12.79 8.2 12.79 7.3V3.52Q12.79 1.92 13.92 3.04Z',
  ],
};
function harbor(name, size = 18, color = palette.n500) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${HARBOR_GLYPHS[name].map((d) => `<path d="${d}"/>`).join('')}</svg>`;
}

const PLATFORMS = {
  github: { name: 'GitHub', fa: brands.faGithub, color: palette.n600 },
  youtube: { name: 'YouTube', fa: brands.faYoutube, color: palette.negative },
  x: { name: 'X', fa: brands.faXTwitter, color: palette.n900 },
  web: { name: 'Website', fa: solid.faGlobe, color: palette.n500 },
  work: {
    name: 'Occupation',
    fa: solid.faBriefcase,
    color: palette.warning500,
  },
};
function faSvg(def, size, color) {
  const [w, h, , , d] = def.icon;
  const paths = Array.isArray(d) ? d : [d];
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${w} ${h}" style="flex-shrink:0">${paths.map((p) => `<path fill="${color}" d="${p}"/>`).join('')}</svg>`;
}

function avatar(id, size) {
  const p = people[id];
  if (p.photo) {
    return `<img class="av" src="file://${path.join(photosDir, p.photo)}" style="width:${size}px;height:${size}px">`;
  }
  return `<div class="av" style="width:${size}px;height:${size}px;background:linear-gradient(135deg,${p.colors[0]},${p.colors[1]});font-size:${Math.round(size * 0.36)}px">${p.initials}</div>`;
}

function handle(id, size = 14) {
  const p = people[id];
  return `<span class="mono" style="font-size:${size}px">${esc(p.handle)}</span>`;
}

function emoji(e, size = 18, z) {
  return `<span class="emoji" style="font-size:${size}px;line-height:${size}px;${z ? `z-index:${z}` : ''}">${e}</span>`;
}

export const screenCss = `
${fontsCss}
*{box-sizing:border-box;margin:0;padding:0}
.screen{position:relative;overflow:hidden;background:${palette.n0};color:${palette.n900};font-family:'Noto Sans','Twemoji',sans-serif;font-size:15px;line-height:20px;-webkit-font-smoothing:antialiased}
.ic{font-style:normal;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.ion{font-family:'Ionicons'}.mci{font-family:'MaterialCommunityIcons'}.mi{font-family:'MaterialIcons'}
.mono{font-family:'Noto Sans Mono',monospace;color:${palette.n500}}
.row{display:flex;align-items:center}
.gap4{gap:4px}.gap8{gap:8px}.gap12{gap:12px}
.av{border-radius:50%;object-fit:cover;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700}
.muted{color:${palette.n500}}
.sec{font-size:14px;line-height:20px}
.small{font-size:12px;line-height:16px}
.title{font-size:17px;line-height:24px;font-weight:700}
.bold{font-weight:700}.semi{font-weight:600}
.emoji{display:inline-block;font-family:'Twemoji'}

.statusbar{height:59px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 32px 10px;font-weight:600;font-size:17px;position:relative;z-index:2}
.statusbar.android{height:48px;align-items:center;padding:0 24px;font-size:14px;font-weight:600}
.island{position:absolute;top:11px;left:50%;transform:translateX(-50%);width:126px;height:37px;border-radius:20px;background:#000}
.punch{position:absolute;top:14px;left:50%;transform:translateX(-50%);width:20px;height:20px;border-radius:50%;background:#000}
.topbar{height:52px;display:flex;align-items:center;padding:0 12px;gap:12px;border-bottom:1px solid rgba(124,134,157,.1);background:${palette.n0}}
.topbar .side{flex:1;min-width:32px;display:flex;align-items:center}
.topbar .side.r{justify-content:flex-end}
.tabs{height:48px;display:flex;border-bottom:1px solid ${palette.n25};background:${palette.n0}}
.tab{flex:1;display:flex;align-items:center;justify-content:center;position:relative;font-weight:600;color:${palette.n500};gap:2px}
.tab.active{color:${palette.n900}}
.tab .lbl{position:relative;padding:0 2px}
.tab.active .lbl:after{content:'';position:absolute;left:0;right:0;bottom:-14px;height:4px;border-radius:2px;background:${palette.primary}}

.post{display:flex;gap:12px;padding:12px 12px 6px;border-bottom:1px solid rgba(124,134,157,.125)}
.post .body{flex:1;min-width:0}
.post .author{display:flex;align-items:center;gap:4px;min-width:0}
.post .author .name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.post .text{margin-top:2px;white-space:pre-wrap}
.post .img{margin-top:8px;border-radius:12px;overflow:hidden;width:100%;aspect-ratio:3/2;background:${palette.n50}}
.post .img img{width:100%;height:100%;object-fit:cover;display:block}
.toolbar{display:flex;align-items:center;gap:8px;margin:4px 0 0 -8px}
.act{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;color:${palette.n500};font-size:14px}
.stack{display:flex;align-items:center;margin-left:auto;padding-right:4px}
.stack .emoji{margin-left:-6px;position:relative}
.stack .emoji:first-child{margin-left:0}
.thread{width:2px;flex:1;background:rgba(124,134,157,.3);margin-top:4px}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:999px;font-weight:600;font-size:14px;line-height:20px;padding:8px 16px}
.btn.primary{background:${palette.primary};color:#fff}
.btn.tertiary{border:1px solid ${palette.n200};color:${palette.n900};padding:5px 14px}
.chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;background:${palette.n25};padding:4px 10px;font-size:13px;line-height:16px;font-weight:600;color:${palette.n600}}
.chip.ok{background:${palette.positive25};color:${palette.positive600}}

.list-label{font-size:12px;line-height:16px;font-weight:600;color:${palette.n500};text-transform:uppercase;letter-spacing:.04em;padding:16px 16px 6px}
.item{display:flex;align-items:center;gap:12px;padding:12px 16px;background:${palette.n0};border-bottom:1px solid ${palette.n25}}
.item .grow{flex:1}

.scrim{position:absolute;inset:0;background:rgba(0,0,0,.4)}
.sheet{position:absolute;left:0;right:0;bottom:0;background:${palette.n0};border-radius:24px 24px 0 0;box-shadow:0 -8px 32px rgba(0,0,0,.18)}
.handle{width:36px;height:5px;border-radius:3px;background:${palette.n200};margin:8px auto 0}
.sheet-h{display:flex;align-items:center;justify-content:space-between;padding:12px 16px 8px}
.srow{display:flex;align-items:center;justify-content:space-between;padding:8px 8px 8px 14px;border:1px solid ${palette.n50};border-radius:12px;font-size:14px}
.input{display:flex;align-items:center;flex:1;border:1px solid ${palette.n200};border-radius:12px;padding:9px 12px;font-size:14px;color:${palette.n500};background:${palette.n25}}
.seg{display:flex;border:1px solid ${palette.n200};border-radius:8px;overflow:hidden;flex-shrink:0}
.seg span{padding:6px 10px;font-size:13px;line-height:16px;font-weight:600;color:${palette.n600}}
.seg span.on{background:${palette.n900};color:#fff}
.seg span+span{border-left:1px solid ${palette.n200}}

.ios-tabs{position:absolute;left:0;right:0;bottom:22px;display:flex;justify-content:center;align-items:center;gap:10px}
.ipad-tabs{height:64px;display:flex;justify-content:center;align-items:center;gap:10px;background:#fff}
.ipad-tabs .pill{height:50px;border-radius:25px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
.ipad-tabs .pill .t{flex-direction:row;height:40px;width:auto;padding:0 16px;border-radius:20px;font-size:14px;gap:8px}
.ipad-tabs .compose{width:50px;height:50px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
.pill{display:flex;align-items:center;height:66px;border-radius:33px;background:rgba(250,251,253,.94);border:1px solid rgba(0,0,0,.06);box-shadow:0 8px 28px rgba(0,0,0,.14);padding:0 8px}
.pill .t{width:72px;height:54px;border-radius:27px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:10px;font-weight:600;color:${palette.n500}}
.pill .t.on{background:${palette.n25};color:${palette.n900}}
.pill .badge{position:absolute;top:6px;right:16px;background:${palette.primary};color:#fff;font-size:10px;line-height:16px;min-width:16px;padding:0 4px;border-radius:8px;text-align:center}
.compose{width:66px;height:66px;border-radius:33px;background:rgba(250,251,253,.94);border:1px solid rgba(0,0,0,.06);box-shadow:0 8px 28px rgba(0,0,0,.14);display:flex;align-items:center;justify-content:center}
.home-ind{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);width:134px;height:5px;border-radius:3px;background:#000}
.and-nav{position:absolute;left:0;right:0;bottom:0;height:80px;background:${palette.n0};border-top:1px solid ${palette.n25};display:flex;align-items:center;justify-content:space-around;padding:0 8px}
.and-nav .t{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12px;font-weight:600;color:${palette.n500};width:80px}
.and-nav .t .ind{width:64px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;position:relative}
.and-nav .t.on{color:${palette.n900}}
.and-nav .t.on .ind{background:${palette.n25}}
.and-nav .badge{position:absolute;top:-2px;right:12px;background:${palette.primary};color:#fff;font-size:11px;line-height:16px;min-width:16px;padding:0 4px;border-radius:8px;text-align:center}
.fab{position:absolute;right:16px;bottom:96px;width:56px;height:56px;border-radius:16px;background:${palette.primary};display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(255,106,0,.4)}
.column{display:flex;flex-direction:column}
.root>*{flex-shrink:0}
.tablet-col{margin:0 auto;width:720px;border-left:1px solid ${palette.n25};border-right:1px solid ${palette.n25};min-height:100%}
`;

function statusBar(ctx, color = palette.n900) {
  if (ctx.platform === 'android') {
    return `<div class="statusbar android" style="color:${color}"><span>9:41</span><span class="row gap4">${mci('wifi', 16, color)}${mci('signal-cellular-3', 16, color)}${mci('battery', 16, color)}</span></div>${ctx.form === 'phone' ? '<div class="punch"></div>' : ''}`;
  }
  const right = `<svg width="74" height="14" viewBox="0 0 74 14" fill="${color}"><rect x="0" y="9" width="3" height="5" rx="1"/><rect x="5" y="6.5" width="3" height="7.5" rx="1"/><rect x="10" y="4" width="3" height="10" rx="1"/><rect x="15" y="1" width="3" height="13" rx="1"/><path d="M31 4.2a9.5 9.5 0 0 1 12 0l-1.5 1.6a7.3 7.3 0 0 0-9 0zm2.6 2.8a6 6 0 0 1 6.8 0l-1.5 1.6a3.8 3.8 0 0 0-3.8 0zm2.6 2.8a2.4 2.4 0 0 1 1.6 0L37 12.2z"/><rect x="48" y="1" width="23" height="12" rx="3.5" fill="none" stroke="${color}" stroke-opacity=".4"/><rect x="50" y="3" width="19" height="8" rx="2"/><rect x="72" y="4.5" width="1.6" height="5" rx=".8" fill-opacity=".4"/></svg>`;
  return `<div class="statusbar" style="color:${color}"><span>9:41</span>${right}</div>${ctx.form === 'phone' ? '<div class="island"></div>' : ''}`;
}

function tabBar(ctx, active, unread = 3) {
  const items = [
    [
      'feed',
      'Feed',
      ion('home-outline', 24, 'currentColor'),
      ion('home', 24, 'currentColor'),
    ],
    [
      'explore',
      'Explore',
      ion('search-outline', 24, 'currentColor'),
      ion('search', 24, 'currentColor'),
    ],
    [
      'notifications',
      'Notifications',
      mci('bell-outline', 24, 'currentColor'),
      mci('bell', 24, 'currentColor'),
    ],
    [
      'verifications',
      'Verifications',
      mci('check-decagram-outline', 24, 'currentColor'),
      mci('check-decagram', 24, 'currentColor'),
    ],
  ];
  if (ctx.platform === 'android') {
    return `<div class="and-nav">${items
      .map(
        ([k, l, off, on]) =>
          `<div class="t ${k === active ? 'on' : ''}"><div class="ind">${k === active ? on : off}${k === 'notifications' && active !== k && unread ? `<span class="badge">${unread}</span>` : ''}</div>${l}</div>`,
      )
      .join('')}</div><div class="fab">${ion('add', 32, '#fff')}</div>`;
  }
  const cls = ctx.form === 'tablet' ? 'ipad-tabs' : 'ios-tabs';
  return `<div class="${cls}"><div class="pill">${items
    .map(
      ([k, l, off, on]) =>
        `<div class="t ${k === active ? 'on' : ''}" style="position:relative">${k === active ? on : off}<span>${l}</span>${k === 'notifications' && active !== k && unread ? `<span class="badge">${unread}</span>` : ''}</div>`,
    )
    .join(
      '',
    )}</div><div class="compose">${mci('square-edit-outline', 26, palette.n900)}</div></div>${ctx.form === 'tablet' ? '' : '<div class="home-ind"></div>'}`;
}

function topbar({ left, center, right } = {}) {
  const l = left ?? avatar('maya', 32);
  const c =
    center ??
    `<img src="file://${path.join(assetsDir, 'images', 'harbor-logo-256.png')}" style="width:36px;height:36px">`;
  const r = right ?? ion('settings-outline', 24, palette.n900);
  return `<div class="topbar"><div class="side">${l}</div><div>${c}</div><div class="side r">${r}</div></div>`;
}
const back = ion('chevron-back', 26, palette.n900);
const titleBar = (t, right = '<span style="width:26px"></span>') =>
  topbar({ left: back, center: `<span class="title">${esc(t)}</span>`, right });

function tabsRow(tabs, active) {
  return `<div class="tabs">${tabs
    .map(
      ([k, l, menu]) =>
        `<div class="tab ${k === active ? 'active' : ''}"><span class="lbl">${esc(l)}</span>${menu ? ion('chevron-down', 14, 'currentColor') : ''}</div>`,
    )
    .join('')}</div>`;
}

function postCard(p, { replyingTo, threadBelow, threadAbove } = {}) {
  const a = people[p.author];
  const img = p.images?.length
    ? `<div class="img"><img src="file://${path.join(photosDir, p.images[0])}"></div>`
    : '';
  const reactions = p.reactions?.length
    ? `<div class="stack">${p.reactions.map((e, i) => emoji(e, 18, p.reactions.length - i)).join('')}</div>`
    : '';
  const count = (n) => (n ? `<span>${n}</span>` : '');
  return `<div class="post" style="${threadAbove ? 'padding-top:0' : ''}">
    <div class="column" style="align-items:center">${threadAbove ? '<div class="thread" style="flex:0 0 12px;margin:0 0 4px"></div>' : ''}${avatar(p.author, 40)}${threadBelow ? '<div class="thread"></div>' : ''}</div>
    <div class="body">
      <div class="author"><span class="name">${esc(a.name)}</span>${handle(p.author)}<span class="muted sec bold">·</span><span class="muted sec">${p.time}</span><span style="flex:1"></span>${ion('ellipsis-horizontal', 18, palette.n500)}</div>
      ${replyingTo ? `<div class="sec muted">Replying to <span style="color:${palette.primary}">${esc(replyingTo)}</span></div>` : ''}
      <div class="text">${esc(p.text)}</div>
      ${img}
      <div class="toolbar">
        <div class="act">${harbor('reactionOutline', 18)}</div>
        <div class="act">${harbor('reply', 18)}${count(p.replies)}</div>
        <div class="act">${harbor('repost', 18)}${count(p.reposts)}</div>
        ${reactions}
      </div>
    </div>
  </div>`;
}

function wrap(ctx, content, { tab = 'feed', overlay = '', statusColor } = {}) {
  const [W, H] = ctx.logical;
  const isTablet = ctx.form === 'tablet';
  const ipad = isTablet && ctx.platform === 'ios';
  const inner = isTablet ? `<div class="tablet-col">${content}</div>` : content;
  return `<div class="screen ${ctx.platform}" style="width:${W}px;height:${H}px">
    <div class="column root" style="position:absolute;inset:0;${isTablet ? `background:${palette.n0}` : ''}">${statusBar(ctx, statusColor)}${ipad ? tabBar(ctx, tab) : ''}${inner}</div>
    ${overlay}
    ${ipad ? '' : tabBar(ctx, tab)}
  </div>`;
}

function settingsList() {
  return `${titleBar('Settings')}
      <div class="list-label">Identity</div>
      <div class="item">${mci('qrcode-scan', 22, palette.n600)}<span class="grow">Pair Identity</span>${ion('chevron-forward', 18, palette.n500)}</div>
      <div class="item">${mci('shield-key-outline', 22, palette.n600)}<span class="grow">Back Up Identity</span>${ion('chevron-forward', 18, palette.n500)}</div>
      <div class="item">${mci('server-network', 22, palette.n600)}<span class="grow">Configure servers</span>${ion('chevron-forward', 18, palette.n500)}</div>
      <div class="list-label">Content Moderation</div>
      <div class="item">${mci('shield-check-outline', 22, palette.n600)}<span class="grow">Moderation settings</span>${ion('chevron-forward', 18, palette.n500)}</div>
      <div class="item">${ion('ban', 22, palette.n600)}<span class="grow">Blocked users</span>${ion('chevron-forward', 18, palette.n500)}</div>
      <div class="list-label">Appearance</div>
      <div class="item">${ion('contrast', 22, palette.n600)}<span class="grow">Theme</span><span class="muted sec">System</span></div>`;
}

const screens = {
  feed(ctx) {
    const list = ['fjord', 'keys', 'studio', 'run', 'puppy']
      .map((k) => postCard(posts[k]))
      .join('');
    return wrap(
      ctx,
      `${topbar()}${tabsRow(
        [
          ['for-you', 'For you'],
          ['following', 'Following', true],
        ],
        'for-you',
      )}${list}`,
      { tab: 'feed' },
    );
  },

  profile(ctx) {
    const me = people.maya;
    const top = ctx.platform === 'android' ? 48 : 59;
    const banner = `<div style="position:relative;height:${150 + top}px;margin-top:-${top}px;background:linear-gradient(135deg,${palette.primary100},${palette.primary} 55%,${palette.primary800})">
      <div style="position:absolute;top:${top + 12}px;left:16px;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center">${ion('chevron-back', 22, '#fff')}</div>
    </div>`;
    const head = `<div style="display:flex;justify-content:space-between;align-items:flex-end;margin:-56px 16px 0;gap:12px;position:relative;z-index:1">
      <div style="border:4px solid ${palette.n0};border-radius:50%">${avatar('maya', 104)}</div>
      <div class="row gap8"><span class="btn tertiary">Edit profile</span>${harbor('share', 20, palette.n900)}<span style="width:8px"></span>${ion('ellipsis-horizontal', 20, palette.n900)}</div>
    </div>
    <div style="margin:12px 16px 0;display:flex;flex-direction:column;gap:4px">
      <div class="title">${esc(me.name)}</div>
      <div class="row gap4">${mi('vpn-key', 13, palette.n500)}<span class="mono small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${me.key}</span></div>
      <div class="sec muted">${esc(me.handle)}</div>
      <div style="margin-top:4px">${esc(me.bio)}</div>
      <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">${verifiedPlatforms
        .map((v) => {
          const p = PLATFORMS[v.platform];
          return `<span class="chip">${faSvg(p.fa, 14, p.color)}${esc(p.name)}: ${esc(v.account)}</span>`;
        })
        .join('')}</div>
      <div class="row gap12 sec" style="margin:8px 0 12px"><span><b>${me.following}</b> <span class="muted">Following</span></span><span><b>${me.followers}</b> <span class="muted">Followers</span></span></div>
    </div>
    ${tabsRow(
      [
        ['posts', 'Posts'],
        ['claims', 'Claims'],
        ['verifies', 'Verifies'],
      ],
      'posts',
    )}
    ${postCard(posts.coffee)}${postCard(posts.market)}`;
    return wrap(ctx, `${banner}${head}`, { tab: 'feed', statusColor: '#fff' });
  },

  servers(ctx) {
    const settings = settingsList();
    const [, H] = ctx.logical;
    const sheetH = Math.round(H * 0.62);
    const sheet = `<div class="scrim"></div><div class="sheet" style="height:${sheetH}px;${ctx.form === 'tablet' ? 'left:50%;transform:translateX(-50%);width:720px' : ''}">
      <div class="handle"></div>
      <div class="sheet-h"><span class="title">Servers</span>${ion('close', 24, palette.n900)}</div>
      <div style="padding:4px 16px 16px;display:flex;flex-direction:column;gap:16px">
        <div class="sec muted">Your posts are published to every server below. Readers fetch them from whichever one answers.</div>
        <div class="column gap8">${servers.active
          .map(
            (s) =>
              `<div class="srow"><span class="row gap8">${ion('checkmark-circle', 18, palette.positive300)}${esc(s)}</span>${ion('remove-circle-outline', 22, palette.negative)}</div>`,
          )
          .join('')}</div>
        <div class="column gap8"><div class="sec muted">Suggested servers</div>${servers.suggested
          .map(
            (s) =>
              `<div class="srow"><span>${esc(s)}</span>${ion('add-circle-outline', 22, palette.primary)}</div>`,
          )
          .join('')}</div>
        <div class="row gap8"><div class="input">https://your.server</div><span class="btn primary">Add</span></div>
      </div>
    </div>`;
    return wrap(ctx, settings, { overlay: sheet });
  },

  verifications(ctx) {
    const list = claims
      .map((c) => {
        const p = PLATFORMS[c.platform];
        return `<div style="display:flex;border-bottom:1px solid ${palette.n25}">
          <div style="margin:4px 0 4px 4px;padding:8px;background:${c.verified ? palette.positive300 : palette.n50};align-self:flex-start">${mci('check-decagram-outline', 24, c.verified ? palette.n0 : palette.n600)}</div>
          <div style="flex:1;padding:12px 16px;display:flex;flex-direction:column;gap:8px">
            <div class="row gap4 sec"><span class="bold">Emma Carter</span><span class="muted">· ${c.time}</span><span style="flex:1"></span>${ion('ellipsis-horizontal', 16, palette.n500)}</div>
            <div>${esc(c.title)}</div>
            <div class="row gap8" style="flex-wrap:wrap"><span class="chip">${faSvg(p.fa, 14, p.color)}${esc(p.name)}</span>${c.verified ? `<span class="chip ok">${ion('checkmark-circle', 14, palette.positive600)}Verified · 1/1</span>` : `<span class="chip">${ion('time-outline', 14, palette.n600)}Pending · 0/1</span>`}</div>
          </div>
        </div>`;
      })
      .join('');
    return wrap(
      ctx,
      `${topbar({ left: ctx.platform === 'android' ? '<span></span>' : avatar('maya', 32), center: '<span class="title">Verifications</span>', right: ion('add-circle-outline', 26, palette.primary) })}${tabsRow(
        [
          ['inbox', 'Inbox'],
          ['outbox', 'Outbox'],
        ],
        'outbox',
      )}${list}`,
      { tab: 'verifications' },
    );
  },

  post(ctx) {
    const p = posts.fjord;
    const a = people[p.author];
    const picker = ['👍', '❤️', '🔥', '😂', '👏', '😮'];
    const focused = `<div style="padding:12px 12px 4px;border-bottom:1px solid rgba(124,134,157,.125)">
      <div class="row gap12">${avatar(p.author, 40)}<div class="column" style="flex:1;gap:2px"><span class="bold">${esc(a.name)}</span>${handle(p.author)}</div>${ion('ellipsis-horizontal', 18, palette.n500)}</div>
      <div style="font-size:17px;line-height:24px;margin-top:10px">${esc(p.text)}</div>
      <div class="post" style="padding:0;border:0;display:block"><div class="img"><img src="file://${path.join(photosDir, p.images[0])}"></div></div>
      <div class="sec muted" style="margin-top:10px">6:12 AM · October 23, 2026</div>
      <div class="toolbar" style="margin-top:6px">
        <div class="act" style="background:rgba(255,106,0,.12);color:${palette.primary}">${harbor('reactionOutline', 18, palette.primary)}</div>
        <div class="act">${harbor('reply', 18)}<span>${p.replies}</span></div>
        <div class="act">${harbor('repost', 18)}<span>${p.reposts}</span></div>
        <div class="stack">${p.reactions.map((e, i) => emoji(e, 18, p.reactions.length - i)).join('')}</div>
      </div>
      <div style="position:relative;height:54px;margin:4px 0 6px">
        <div style="position:absolute;left:0;top:0;display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:999px;background:${palette.n0};box-shadow:0 6px 20px rgba(13,16,22,.18);border:1px solid ${palette.n50}">${picker
          .map(
            (e, i) =>
              `<span style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;${i === 2 ? `background:rgba(255,106,0,.14);box-shadow:inset 0 0 0 2px ${palette.primary}` : ''}">${emoji(e, 26)}</span>`,
          )
          .join(
            '',
          )}<span style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${palette.n25}">${ion('add', 22, palette.n600)}</span></div>
      </div>
    </div>`;
    const thread = replies
      .map((r, i) =>
        postCard(
          {
            author: r.author,
            time: r.time,
            text: r.text,
            replies: i === 0 ? 1 : 0,
            reposts: 0,
            reactions: i === 1 ? ['😂'] : [],
            reactionCount: i === 1 ? 4 : 0,
          },
          { threadBelow: i === 0, threadAbove: i === 1 },
        ),
      )
      .join('');
    return wrap(ctx, `${titleBar('Post')}${focused}${thread}`, { tab: 'feed' });
  },

  moderation(ctx) {
    const [, H] = ctx.logical;
    const sheetH = Math.round(H * 0.7);
    const rows = moderationLabels
      .map(
        (
          m,
          i,
        ) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;${i < moderationLabels.length - 1 ? `border-bottom:1px solid ${palette.n25}` : ''}">
          <div class="column" style="flex:1"><span class="sec semi">${esc(m.name)}</span><span class="small muted">${esc(m.description)}</span></div>
          <div class="seg">${['hide', 'warn', 'show'].map((l) => `<span class="${m.level === l ? 'on' : ''}">${l[0].toUpperCase() + l.slice(1)}</span>`).join('')}</div>
        </div>`,
      )
      .join('');
    const sheet = `<div class="scrim"></div><div class="sheet" style="height:${sheetH}px;${ctx.form === 'tablet' ? 'left:50%;transform:translateX(-50%);width:640px' : ''}">
      <div class="handle"></div>
      <div class="sheet-h"><span class="title">Content Moderation</span>${ion('close', 24, palette.n900)}</div>
      <div class="sec muted" style="padding:0 16px 8px">Choose what happens to posts carrying each label. Labels come from the moderation services your servers use.</div>
      ${rows}
      <div class="small muted" style="padding:12px 16px">Content policy for the FUTO servers ↗</div>
    </div>`;
    return wrap(ctx, settingsList(), { overlay: sheet });
  },

  notifications(ctx) {
    const rows = notifications
      .map((n) => {
        const a = people[n.actor];
        if (n.kind === 'reply') {
          return postCard(
            {
              author: n.actor,
              time: n.time,
              text: n.text,
              replies: 0,
              reposts: 0,
              reactions: [],
            },
            { replyingTo: 'Emma Carter' },
          );
        }
        const summary = {
          follow: 'followed you',
          repost: 'reposted your post',
          reaction: `reacted ${n.emoji ? emoji(n.emoji, 16) : ''} to your post`,
          verificationRequest: 'requested a verification from you',
        }[n.kind];
        const quoted = n.post
          ? `<div style="margin-top:8px;border:1px solid ${palette.n50};border-radius:12px;padding:10px 12px;display:flex;gap:10px"><div style="flex:1"><div class="row gap4 small"><span class="bold">Emma Carter</span><span class="muted">· ${posts[n.post].time}</span></div><div class="sec" style="margin-top:2px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(posts[n.post].text)}</div></div>${posts[n.post].images ? `<img src="file://${path.join(photosDir, posts[n.post].images[0])}" style="width:48px;height:48px;border-radius:8px;object-fit:cover">` : ''}</div>`
          : '';
        const glyph = {
          follow: mci('account-plus', 16, palette.primary),
          repost: harbor('repost', 16, palette.positive300),
          reaction: harbor('reactionOutline', 16, palette.negative),
          verificationRequest: mci(
            'check-decagram-outline',
            16,
            palette.warning500,
          ),
        }[n.kind];
        return `<div class="post"><div style="position:relative">${avatar(n.actor, 40)}<span style="position:absolute;right:-4px;bottom:-4px;background:${palette.n0};border-radius:50%;padding:2px;display:flex">${glyph}</span></div><div class="body"><div style="padding-top:2px"><span class="bold">${esc(a.name)}</span> ${summary} <span class="muted sec">· ${n.time}</span></div>${quoted}<div style="height:8px"></div></div></div>`;
      })
      .join('');
    return wrap(
      ctx,
      `${topbar({ left: ctx.platform === 'android' ? '<span></span>' : avatar('maya', 32), center: '<span class="title">Notifications</span>' })}${rows}`,
      { tab: 'notifications' },
    );
  },
};

export function renderScreen(name, ctx) {
  const fn = screens[name];
  if (!fn) throw new Error(`Unknown screen ${name}`);
  return fn(ctx);
}
