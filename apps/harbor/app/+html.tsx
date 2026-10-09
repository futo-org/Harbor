import {
  BOOT_SKELETON_STYLE,
  BOOT_SKELETON_SCRIPT,
  BootSkeleton,
} from '@/src/common/components/layout/BootSkeleton';
import { APP_NAME } from '@/src/common/constants';
import type { PropsWithChildren } from 'react';

const ROOT_STYLE =
  'html{overflow-y:scroll}#root{display:flex;flex-direction:column;min-height:100vh}' +
  'html>body[data-scroll-locked]{overflow:visible!important;margin-right:0!important}' +
  '@media(hover:hover){.underlineOnHover:hover{text-decoration:underline}}' +
  '.transparentText{color:transparent}';

// Every code point in the Twemoji font, so pages without emoji never fetch it.
const TWEMOJI_UNICODE_RANGE =
  'U+23,U+2A,U+30-39,U+A9,U+AE,U+200D,U+203C-3299,U+20E3,U+FE0F,U+1F000-1FAFF,U+E0020-E007F';

// Declared here rather than through expo-font, whose injected @font-face has
// no font-weight range: browsers then clamp the variable font to 400 and
// synthesise bold, which Safari renders badly. Twemoji's faces cover every
// weight and italic too, so emoji are never synthesised bold or slanted; it
// blocks rather than swaps, so the platform's emoji never show first.
const FONT_STYLE = `
@font-face{font-family:NotoSans;src:url(/fonts/NotoSans.ttf);font-weight:100 900;font-style:normal;font-display:swap}
@font-face{font-family:NotoSans;src:url(/fonts/NotoSans-Italic.ttf);font-weight:100 900;font-style:italic;font-display:swap}
@font-face{font-family:Twemoji;src:url(/fonts/Twemoji.woff2);font-weight:100 900;font-style:normal;font-display:block;unicode-range:${TWEMOJI_UNICODE_RANGE}}
@font-face{font-family:Twemoji;src:url(/fonts/Twemoji.woff2);font-weight:100 900;font-style:italic;font-display:block;unicode-range:${TWEMOJI_UNICODE_RANGE}}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
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
