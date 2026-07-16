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
        <title>Harbor</title>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
