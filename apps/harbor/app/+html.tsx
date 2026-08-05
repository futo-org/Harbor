import { APP_NAME } from '@/src/common/constants';
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <title>{APP_NAME}</title>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        {/* Placeholder replaced with runtime env by server.js at startup. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static placeholder, no user input
          dangerouslySetInnerHTML={{
            __html: 'globalThis.__POLYCENTRIC_ENV__ = "__RUNTIME_ENV__";',
          }}
        />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
