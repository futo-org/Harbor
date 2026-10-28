import {
  BOOT_SKELETON_STYLE,
  BOOT_SKELETON_SCRIPT,
  BootSkeleton,
} from '@/src/common/components/layout/BootSkeleton';
import { TWEMOJI_WEB_FONT_FILE } from '@/src/common/assets/twemojiFont';
import { APP_NAME } from '@/src/common/constants';
import { useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const ROOT_STYLE =
  'html{overflow-y:scroll}#root{display:flex;flex-direction:column;min-height:100dvh}' +
  'html>body[data-scroll-locked]{overflow:visible!important;margin-right:0!important}' +
  '@media(hover:hover){.underlineOnHover:hover{text-decoration:underline}}';

// Declared here rather than through expo-font, whose injected @font-face has
// no font-weight range: browsers then clamp the variable font to 400 and
// synthesise bold, which Safari renders badly. Twemoji's face covers every
// weight too, so emoji are never synthesised bold; it blocks rather than
// swaps, so the platform's emoji never show first.
const FONT_STYLE = `
@font-face{font-family:NotoSans;src:url(/fonts/NotoSans.ttf);font-weight:100 900;font-style:normal;font-display:swap}
@font-face{font-family:NotoSansMono;src:url(/fonts/NotoSansMono.ttf);font-weight:100 900;font-style:normal;font-display:swap}
@font-face{font-family:Twemoji;src:url(/fonts/${TWEMOJI_WEB_FONT_FILE});font-weight:100 900;font-style:normal;font-display:block}
`;

// Switches to dev icons on local builds. Deployed apps use icons defined by server.js
const ICON_SUFFIX = process.env.APP_VARIANT === 'dev' ? '-dev' : '';

export default function Root({ children }: PropsWithChildren) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } =
    useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <title>{APP_NAME}</title>
        <link
          rel="icon"
          href={`/favicon${ICON_SUFFIX}.ico`}
          sizes="16x16 32x32 48x48"
        />
        <link
          rel="apple-touch-icon"
          href={`/apple-touch-icon${ICON_SUFFIX}.png`}
        />
        {/* Placeholder replaced with runtime env by server.js at startup. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static placeholder, no user input
          dangerouslySetInnerHTML={{
            __html: 'globalThis.__HARBOR_ENV__ = "__RUNTIME_ENV__";',
          }}
        />
        <style
          id="polycentric-root-reset"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static stylesheet, no user input
          dangerouslySetInnerHTML={{ __html: ROOT_STYLE }}
        />
        <link
          rel="preload"
          href="/fonts/NotoSans.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href={`/fonts/${TWEMOJI_WEB_FONT_FILE}`}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <style
          id="polycentric-fonts"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static stylesheet, no user input
          dangerouslySetInnerHTML={{ __html: FONT_STYLE }}
        />
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static script, no user input
          dangerouslySetInnerHTML={{ __html: BOOT_SKELETON_SCRIPT }}
        />
        <style
          id="polycentric-boot-skeleton"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static stylesheet, no user input
          dangerouslySetInnerHTML={{ __html: BOOT_SKELETON_STYLE }}
        />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        <BootSkeleton />
        {bodyNodes}
      </body>
    </html>
  );
}
