import {
  AVATAR_SIZE,
  BAR_HEIGHT,
  PULSE_MS,
} from '@/src/common/components/skeletons';
import {
  LAYOUT_SIZES,
  TABS_HEIGHT,
  TOPBAR_HEIGHT,
} from '@/src/common/components/metrics';
import HARBOR_LOGO from '@/src/common/assets/images/harbor-logo-256.png';
import type { ImageURISource } from 'react-native';
import { POST_SKELETON_LIST_COUNT } from '@/src/features/post/PostSkeleton';
import {
  BorderRadius,
  Breakpoints,
  darkPalette,
  lightPalette,
  type Palette,
  Spacing,
  withHexOpacity,
  ZIndex,
} from '@/src/common/theme';

const BOOT_SKELETON_ID = 'boot-skeleton';
const FADE_OUT_MS = 300;

// Asset imports resolve to `{ uri }` on web.
const HARBOR_LOGO_URI = (HARBOR_LOGO as ImageURISource).uri;

// Label widths of the signed-in nav; signed-out shows only the first item.
const NAV_LABEL_WIDTHS = [50, 64, 104, 100, 54, 66];
// Real nav items are 48–51px tall, depending on the icon glyph.
const NAV_ITEM_HEIGHT = 50;
// `Button` size md; icon-only in the narrow sidebar.
const POST_BUTTON_HEIGHT = 50;
const POST_BUTTON_NARROW_SIZE = 47;
const SEARCH_BAR_HEIGHT = 40;
const IDENTITY_AVATAR_SIZE = 38;
const SIGNUP_WIDGET_HEIGHT = 324;
// `Button` size md with the "Sign up" and "Log in" titles.
const SIGNUP_BAR_BUTTON_HEIGHT = 47;
const SIGNUP_BAR_BUTTON_WIDTHS = [97, 88];

/**
 * Runs before the first paint. Applies the theme `ThemeProvider` will
 * resolve (the stored preference, or the system scheme for 'system' or
 * nothing stored), and flags a signed-in visitor by the active identity that
 * js-browser's storage driver keeps in localStorage.
 */
export const BOOT_SKELETON_SCRIPT = `
var root=document.documentElement;
try{var t=JSON.parse(localStorage.getItem('polycentric:settings')).state.theme}catch(e){}
if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
root.dataset.theme=t;
try{for(var i=0;i<localStorage.length;i++)if(localStorage.key(i).indexOf('polycentric:activeIdentity:')===0)root.dataset.signedIn=''}catch(e){}
`;

/**
 * Container queries size against the viewport without the scrollbar, the
 * width `useWindowDimensions` reports, so the breakpoints match `Layout`.
 */
export const BOOT_SKELETON_STYLE = `
:root{${buildColorVariables(lightPalette)}}
:root[data-theme=dark]{${buildColorVariables(darkPalette)}}
:root:not([data-signed-in]) .sk-signed-in,:root[data-signed-in] .sk-signed-out{display:none!important}
#${BOOT_SKELETON_ID}{position:fixed;inset:0;z-index:${ZIndex.bootSkeleton};overflow:hidden;background:var(--sk-bg);container-type:inline-size;transition:opacity ${FADE_OUT_MS}ms}
@keyframes sk-pulse{from{opacity:.5}to{opacity:1}}
.sk-screen{display:flex;height:100%}
.sk-bone{flex-shrink:0;height:${BAR_HEIGHT}px;border-radius:${BorderRadius.full}px;background:var(--sk-bone)}
.sk-row{display:flex;align-items:center;gap:${Spacing.sm}px}
.sk-topbar{display:none;flex-shrink:0;align-items:center;justify-content:space-between;height:${TOPBAR_HEIGHT}px;padding:0 ${Spacing.md}px;box-sizing:border-box;border-bottom:1px solid var(--sk-topbar-border)}
.sk-left{flex:1 0 auto;display:flex;justify-content:flex-end}
.sk-left-inner{display:flex;flex-direction:column;width:${LAYOUT_SIZES.leftSidebarWideWidth}px;padding:0 ${LAYOUT_SIZES.leftSidebarWidePadding}px;box-sizing:border-box}
.sk-logo{margin:${Spacing.sm}px ${Spacing.lg}px ${Spacing.lg}px}
.sk-nav{display:flex;flex-direction:column;gap:${Spacing.sm}px;padding:${Spacing.xs}px 0}
.sk-nav-item{display:flex;align-items:center;gap:${Spacing.md}px;height:${NAV_ITEM_HEIGHT}px;padding:0 ${Spacing.lg}px}
.sk-nav-icon{margin:0 3px}
.sk-post-button{height:${POST_BUTTON_HEIGHT}px;margin-top:${Spacing.md}px}
.sk-identity{display:flex;align-items:center;gap:${Spacing.sm}px;margin-top:auto;padding-bottom:${Spacing.xl}px}
.sk-identity-text{display:flex;flex-direction:column;gap:${Spacing.xs}px}
.sk-main{flex:1 1 auto;display:flex;min-width:0}
.sk-main-inner{display:flex;flex-shrink:0;justify-content:space-between;width:${LAYOUT_SIZES.mainMax}px}
.sk-primary{flex:1;max-width:${LAYOUT_SIZES.primaryColumnMaxWidth}px;box-sizing:border-box;border:solid var(--sk-border);border-width:0 1px}
.sk-header-row{display:flex;align-items:center;gap:${Spacing.lg}px;padding:${Spacing.md}px ${Spacing.lg}px;border-bottom:1px solid var(--sk-border)}
.sk-tabs{display:flex;height:${TABS_HEIGHT}px;border-bottom:1px solid var(--sk-border)}
.sk-tab{flex:1;display:flex;align-items:center;justify-content:center}
.sk-post{display:flex;gap:${Spacing.md}px;padding:${Spacing.md}px;border-bottom:1px solid var(--sk-bone);animation:sk-pulse ${PULSE_MS}ms ease-in-out infinite alternate}
.sk-post-body{flex:1;display:flex;flex-direction:column;gap:${Spacing.sm}px}
.sk-right{display:flex;flex-direction:column;gap:${Spacing.md}px;width:${LAYOUT_SIZES.rightSidebarWidth}px;margin-right:${LAYOUT_SIZES.rightSidebarWideMargin}px;padding-top:${Spacing.lg}px;box-sizing:border-box}
.sk-card{border-radius:${BorderRadius.lg}px}
.sk-signup-bar{display:none;position:absolute;left:0;right:0;bottom:0;align-items:center;justify-content:space-between;gap:${Spacing.md}px;padding:${Spacing.md}px ${Spacing.lg}px;background:var(--sk-bg);border-top:1px solid var(--sk-border)}
.sk-signup-text{display:flex;flex-direction:column;gap:${Spacing.sm}px}
@container (max-width:${Breakpoints['2xl']}px){.sk-main-inner{width:${LAYOUT_SIZES.mainUpTo2xl}px}.sk-right{margin-right:${LAYOUT_SIZES.rightSidebarNarrowMargin}px;padding:${Spacing.lg}px ${Spacing.md}px 0}}
@container (max-width:${Breakpoints.xl}px){.sk-left-inner{width:${LAYOUT_SIZES.leftSidebarNarrowWidth}px;padding:0;align-items:center}.sk-logo{margin:${Spacing.sm}px 0 ${Spacing.lg}px}.sk-nav-label,.sk-identity-text{display:none}.sk-post-button{width:${POST_BUTTON_NARROW_SIZE}px;height:${POST_BUTTON_NARROW_SIZE}px}.sk-identity{padding-bottom:${Spacing.md}px}}
@container (max-width:${Breakpoints.lg}px){.sk-main-inner{width:${LAYOUT_SIZES.mainUpToLg}px}}
@container (max-width:${Breakpoints.md}px){.sk-main-inner{width:${LAYOUT_SIZES.mainUpToMd}px}.sk-right{display:none}.sk-signup-bar{display:flex}}
@container (max-width:${Breakpoints.sm}px){.sk-screen{flex-direction:column}.sk-topbar{display:flex}.sk-left{display:none}.sk-main,.sk-main-inner{width:100%}}
`;

/**
 * Static web startup placeholder shaped like `Layout` around the feed
 * (signed in) or explore (signed out), with `PostSkeleton` rows.
 * Server-rendered next to `#root`, it shows on first paint, before any JS
 * runs, and `RootLayout` removes it once the app is ready.
 */
export function BootSkeleton() {
  return (
    <div id={BOOT_SKELETON_ID} aria-hidden>
      <div className="sk-screen">
        <div className="sk-topbar">
          <Bone width={24} height={24} />
          <img src={HARBOR_LOGO_URI} width={36} height={36} alt="" />
          <div style={{ width: 24 }} />
        </div>
        <div className="sk-left">
          <div className="sk-left-inner">
            <img
              className="sk-logo"
              src={HARBOR_LOGO_URI}
              width={40}
              height={40}
              alt=""
            />
            <div className="sk-nav">
              {NAV_LABEL_WIDTHS.map((labelWidth, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows never reorder
                  key={i}
                  className={i > 0 ? 'sk-nav-item sk-signed-in' : 'sk-nav-item'}
                >
                  <Bone className="sk-nav-icon" width={24} height={24} />
                  <Bone className="sk-nav-label" width={labelWidth} />
                </div>
              ))}
            </div>
            <Bone className="sk-post-button sk-signed-in" />
            <div className="sk-identity sk-signed-in">
              <Bone
                width={IDENTITY_AVATAR_SIZE}
                height={IDENTITY_AVATAR_SIZE}
              />
              <div className="sk-identity-text">
                <Bone width={90} />
                <Bone width={70} />
              </div>
            </div>
          </div>
        </div>
        <div className="sk-main">
          <div className="sk-main-inner">
            <div className="sk-primary">
              {/* Explore's search entry */}
              <div className="sk-header-row sk-signed-out">
                <Bone height={SEARCH_BAR_HEIGHT} width="100%" />
              </div>
              <div className="sk-tabs">
                <div className="sk-tab">
                  <Bone width={50} />
                </div>
                <div className="sk-tab">
                  <Bone width={60} />
                </div>
              </div>
              {/* The feed's composer */}
              <div className="sk-header-row sk-signed-in">
                <Bone width={AVATAR_SIZE} height={AVATAR_SIZE} />
                <Bone width={140} />
              </div>
              {Array.from({ length: POST_SKELETON_LIST_COUNT }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows never reorder
                <PostBones key={i} />
              ))}
            </div>
            <div className="sk-right">
              <Bone height={SEARCH_BAR_HEIGHT} />
              <Bone
                className="sk-card sk-signed-out"
                height={SIGNUP_WIDGET_HEIGHT}
              />
            </div>
          </div>
        </div>
        {/* Narrow viewports' replacement for the right sidebar's signup widget */}
        <div className="sk-signup-bar sk-signed-out">
          <div className="sk-signup-text">
            <Bone width={90} />
            <Bone width={140} />
          </div>
          <div className="sk-row">
            {SIGNUP_BAR_BUTTON_WIDTHS.map((width) => (
              <Bone
                key={width}
                width={width}
                height={SIGNUP_BAR_BUTTON_HEIGHT}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Fades the skeleton out over the app, which is rendered underneath by now. */
export function hideBootSkeleton() {
  const skeleton = document.getElementById(BOOT_SKELETON_ID);
  if (!skeleton) return;
  // Lets clicks reach the app during the fade.
  skeleton.style.pointerEvents = 'none';
  skeleton.style.opacity = '0';
  setTimeout(() => skeleton.remove(), FADE_OUT_MS);
}

/** Mirrors `PostSkeleton`. */
function PostBones() {
  return (
    <div className="sk-post">
      <Bone width={AVATAR_SIZE} height={AVATAR_SIZE} />
      <div className="sk-post-body">
        <div className="sk-row">
          <Bone width={120} />
          <Bone width={60} />
          <Bone width={40} />
        </div>
        <Bone width="100%" />
        <Bone width="80%" />
        <div
          className="sk-row"
          style={{ gap: Spacing.lg, marginTop: Spacing.sm }}
        >
          <Bone width={28} height={14} />
          <Bone width={28} height={14} />
          <Bone width={28} height={14} />
        </div>
      </div>
    </div>
  );
}

function Bone({
  className,
  width,
  height,
}: {
  className?: string;
  width?: number | `${number}%`;
  height?: number;
}) {
  return (
    <div
      className={className ? `sk-bone ${className}` : 'sk-bone'}
      style={{ width, height }}
    />
  );
}

function buildColorVariables(palette: Palette) {
  return [
    `--sk-bg:${palette.neutral_0}`,
    `--sk-border:${palette.neutral_25}`,
    `--sk-bone:${withHexOpacity(palette.neutral_500, '20')}`,
    `--sk-topbar-border:${withHexOpacity(palette.neutral_500, '10')}`,
  ].join(';');
}
