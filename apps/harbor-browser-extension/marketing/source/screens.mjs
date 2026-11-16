// A browser window showing a page with the side panel open, as HTML at
// logical pixel size. Posts, avatars and styles are the Harbor app's mockups.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { people } from '../../../harbor/marketing/source/data.mjs';
import {
  assetsDir,
  avatar,
  esc,
  ion,
  palette,
  photosDir,
  postCard,
} from '../../../harbor/marketing/source/screens.mjs';
import { comments, draft, page, thread, viewer } from './data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionIcon = path.resolve(here, '../../public/icon/48.png');
const logo = path.join(assetsDir, 'images', 'harbor-logo-256.png');
const photo = `file://${path.join(photosDir, page.photo)}`;

/** Logical size of the window's parts. */
export const PAGE_WIDTH = 800;
export const PANEL_WIDTH = 400;
const CHROME_HEIGHT = 80;

export const windowCss = `
.window{background:#DEE1E6;overflow:hidden;font-family:'Noto Sans',sans-serif;color:${palette.n900}}
.window .strip{height:36px;display:flex;align-items:flex-end;padding:0 12px}
.window .wtab{height:30px;width:280px;background:#fff;border-radius:9px 9px 0 0;display:flex;align-items:center;gap:8px;padding:0 12px;font-size:12px;white-space:nowrap}
.window .wtab span{flex:1;overflow:hidden;text-overflow:ellipsis}
.window .fav{width:14px;height:14px;border-radius:4px;background:${palette.positive300};flex-shrink:0}
.window .bar{height:44px;background:#fff;display:flex;align-items:center;gap:14px;padding:0 14px;border-bottom:1px solid ${palette.n100}}
.window .address{flex:1;height:30px;border-radius:15px;background:${palette.n25};display:flex;align-items:center;padding:0 14px;font-size:13px}
.window .ext{width:30px;height:30px;border-radius:15px;background:${palette.n50};display:flex;align-items:center;justify-content:center}
.window .ext img{width:20px;height:20px;border-radius:5px}
.window .content{display:flex;background:#fff}

.article{width:${PAGE_WIDTH}px;overflow:hidden;background:#fff}
.article .nav{height:56px;display:flex;align-items:center;gap:28px;padding:0 48px;border-bottom:1px solid ${palette.n50};font-size:14px;color:${palette.n600}}
.article .nav b{font-size:18px;color:${palette.n900};margin-right:auto}
.article .inner{padding:36px 48px}
.article h2{font-size:38px;line-height:44px;font-weight:700;letter-spacing:-.02em;text-wrap:balance}
.article .by{display:flex;align-items:center;gap:10px;margin:18px 0 24px;font-size:14px;color:${palette.n600}}
.article .hero{width:100%;height:230px;object-fit:cover;border-radius:12px;display:block}
.article p{font-size:17px;line-height:28px;color:${palette.n900};margin-top:20px}

.panel{width:${PANEL_WIDTH}px;border-left:1px solid ${palette.n100};position:relative;display:flex;flex-direction:column}
.panel>*{flex-shrink:0}
.panel .brand{font-size:17px;line-height:24px;white-space:nowrap}
.panel .card{margin:12px;border:1px solid ${palette.n50};border-radius:12px;display:flex;overflow:hidden}
.panel .card .meta{flex:1;min-width:0;padding:10px 12px}
.panel .card .title{font-size:15px;line-height:20px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.panel .card .desc{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.panel .card img{width:96px;object-fit:cover}
.panel .count{padding:0 12px 4px}
.panel .composer{position:absolute;left:0;right:0;bottom:0;height:56px;display:flex;align-items:center;gap:12px;padding:0 12px;background:#fff;border-top:1px solid ${palette.n50}}
.panel .dialog{position:absolute;left:16px;right:16px;top:96px;background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.24)}
.panel .dialog .head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid ${palette.n50}}
.panel .dialog .draft{display:flex;gap:12px;padding:16px;min-height:170px;font-size:17px;line-height:24px}
.panel .dialog .foot{padding:12px 16px;border-top:1px solid ${palette.n50};display:flex;align-items:center;gap:8px}
`;

function article(height) {
  return `<div class="article" style="height:${height}px">
    <div class="nav"><b>${esc(page.site)}</b><span>Routes</span><span>Journal</span><span>Join</span></div>
    <div class="inner">
      <h2>${esc(page.title)}</h2>
      <div class="by">${avatar(page.author, 28)}<span>${esc(people[page.author].name)}</span><span>·</span><span>${page.date}</span></div>
      <img class="hero" src="${photo}">
      ${page.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
    </div>
  </div>`;
}

const brandBar = `<div class="topbar"><div class="side row gap8"><img src="file://${logo}" style="width:36px;height:36px"><span class="brand"><b>Harbor</b> Anywhere</span></div><div class="side r">${avatar(viewer, 32)}</div></div>`;

const pageCard = `<div class="card"><div class="meta"><div class="small semi muted">${esc(page.domain)}</div><div class="title bold">${esc(page.title)}</div><div class="sec muted desc">${esc(page.description)}</div></div><img src="${photo}"></div>`;

const composer = (placeholder) =>
  `<div class="composer">${avatar(viewer, 40)}<span class="muted" style="flex:1">${placeholder}</span>${ion('image-outline', 22, palette.n600)}</div>`;

const commentList = `${brandBar}${pageCard}<div class="count sec muted">${comments.length} comments</div>${comments.map((c) => postCard(c)).join('')}`;

const panels = {
  comments: () => `${commentList}${composer("What's on your mind?")}`,
  thread: () => {
    const p = thread.post;
    return `<div class="topbar"><div class="side">${ion('chevron-back', 26, palette.n900)}</div><div><span class="title">Post</span></div><div class="side r"></div></div>
      ${postCard(p)}
      <div class="item">${avatar(viewer, 40)}<span class="muted" style="flex:1">Post your reply</span>${ion('image-outline', 22, palette.n600)}</div>
      ${thread.replies.map((r) => postCard(r)).join('')}`;
  },
  compose: () => `${commentList}${composer("What's on your mind?")}
    <div class="scrim"></div>
    <div class="dialog">
      <div class="head">${ion('close', 24, palette.n900)}<span class="title">New Post</span><span class="btn primary">Post</span></div>
      <div class="draft">${avatar(viewer, 40)}<span>${esc(draft)}</span></div>
      <div class="foot">${ion('image-outline', 22, palette.n600)}<span class="small semi muted">${draft.length}/2000</span></div>
    </div>`,
};

/** The window at `width` by `height`, with the side panel in state `panel`. */
export function renderWindow(panel, height) {
  const render = panels[panel];
  if (!render) throw new Error(`Unknown panel ${panel}`);
  const contentHeight = height - CHROME_HEIGHT;
  return `<div class="window" style="width:${PAGE_WIDTH + PANEL_WIDTH}px;height:${height}px">
    <div class="strip"><div class="wtab"><i class="fav"></i><span>${esc(page.title)}</span>${ion('close', 14, palette.n600)}</div></div>
    <div class="bar">${ion('arrow-back', 18, palette.n600)}${ion('arrow-forward', 18, palette.n600)}${ion('refresh', 18, palette.n600)}<div class="address">${esc(page.url)}</div><div class="ext"><img src="file://${extensionIcon}"></div>${ion('ellipsis-vertical', 18, palette.n600)}</div>
    <div class="content" style="height:${contentHeight}px">${article(contentHeight)}<div class="panel screen" style="height:${contentHeight}px">${render()}</div></div>
  </div>`;
}
