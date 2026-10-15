import {
  BOOT_SKELETON_STYLE,
  BOOT_SKELETON_SCRIPT,
  BootSkeleton,
} from '@/src/common/components/layout/BootSkeleton';
import { TWEMOJI_WEB_FONT_FILE } from '@/src/common/assets/twemojiFont';
import { APP_NAME } from '@/src/common/constants';
import type { PropsWithChildren } from 'react';

const ROOT_STYLE =
  'html{overflow-y:scroll}#root{display:flex;flex-direction:column;min-height:100dvh}' +
  'html>body[data-scroll-locked]{overflow:visible!important;margin-right:0!important}' +
  '@media(hover:hover){.underlineOnHover:hover{text-decoration:underline}}';

// Declared here rather than through expo-font, whose injected @font-face has
// no font-weight range: browsers then clamp the variable font to 400 and
// synthesise bold, which Safari renders badly. Twemoji's faces cover every
// weight and italic too, so emoji are never synthesised bold or slanted; it
// blocks rather than swaps, so the platform's emoji never show first.
const FONT_STYLE = `
@font-face{font-family:NotoSans;src:url(/fonts/NotoSans.ttf);font-weight:100 900;font-style:normal;font-display:swap}
@font-face{font-family:NotoSans;src:url(/fonts/NotoSans-Italic.ttf);font-weight:100 900;font-style:italic;font-display:swap}
@font-face{font-family:Twemoji;src:url(/fonts/${TWEMOJI_WEB_FONT_FILE});font-weight:100 900;font-style:normal;font-display:block}
@font-face{font-family:Twemoji;src:url(/fonts/${TWEMOJI_WEB_FONT_FILE});font-weight:100 900;font-style:italic;font-display:block}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <title>{APP_NAME}</title>
        <link rel="icon" href="/favicon.ico" sizes="any" />
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
      </head>
      <body>
        {children}
        <BootSkeleton />
      </body>
    </html>
  );
}
