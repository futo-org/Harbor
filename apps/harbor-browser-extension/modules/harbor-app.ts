import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineWxtModule } from 'wxt/modules';

// Assets from the pnpm store, such as the icon fonts, sit at paths too long
// for Windows to read (260 characters), so the store segment is dropped.
const PNPM_STORE = /assets\/__node_modules\/\.pnpm\/[^/]+\/node_modules\//g;

// Firefox Add-ons rejects an extension with a script over 5MB.
const MAX_SCRIPT_LENGTH = 4_000_000;

/**
 * Splits a Metro bundle into scripts to run in order. Its modules are
 * separate statements, each starting a line.
 */
function splitBundle(source: string): string[] {
  const parts = [''];
  for (const statement of source.split(/\n(?=__[dr]\()/)) {
    const last = parts.length - 1;
    if (
      parts[last] &&
      parts[last].length + statement.length > MAX_SCRIPT_LENGTH
    )
      parts.push(`${statement}\n`);
    else parts[last] += `${statement}\n`;
  }
  return parts;
}

// Packages the Harbor web export (apps/harbor/dist) into the extension, with
// its extension page as browser-extension.html. Dev frames the Expo dev server instead.
const APP_ROUTE = '/anywhere/browser-extension/panel';
export default defineWxtModule((wxt) => {
  if (wxt.config.command === 'serve') return;

  const exportDir = resolve(wxt.config.root, '../harbor/dist');
  const clientDir = join(exportDir, 'client');
  const pagePath = join(exportDir, `server${APP_ROUTE}.html`);

  wxt.hooks.hook('build:publicAssets', (_, files) => {
    if (!existsSync(pagePath)) {
      throw new Error(
        `Harbor web export not found at ${pagePath}. Run "pnpm build:app" first.`,
      );
    }

    // The parts of each script that was split, by its path in the page.
    const splitScripts = new Map<string, string[]>();
    for (const entry of readdirSync(clientDir, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue;
      const absoluteSrc = join(entry.parentPath, entry.name);
      // Browsers reserve top-level names that start with an underscore.
      const relativeDest = relative(clientDir, absoluteSrc)
        .replace(/^_expo\//, 'expo/')
        .replace(PNPM_STORE, 'assets/');
      if (entry.name.endsWith('.js')) {
        const source = readFileSync(absoluteSrc, 'utf8');
        const contents = source.replace(PNPM_STORE, 'assets/');
        if (contents.length > MAX_SCRIPT_LENGTH) {
          const parts = splitBundle(contents).map((part, n) => ({
            relativeDest: relativeDest.replace(/\.js$/, `.${n}.js`),
            contents: part,
          }));
          files.push(...parts);
          splitScripts.set(
            `/${relativeDest}`,
            parts.map((part) => `/${part.relativeDest}`),
          );
          continue;
        }
        if (contents !== source) {
          files.push({ relativeDest, contents });
          continue;
        }
      }
      files.push({ absoluteSrc, relativeDest });
    }

    // Any EXPO_PUBLIC_* set for the build overrides the value baked into the
    // web export, as apps/harbor/server.js does for the web app.
    const runtimeEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        key.startsWith('EXPO_PUBLIC_'),
      ),
    );
    const html = readFileSync(pagePath, 'utf8').replace(
      /globalThis\.__HARBOR_ENV__ = [^<]*/,
      () => `globalThis.__HARBOR_ENV__ = ${JSON.stringify(runtimeEnv)};`,
    );

    // Extension pages cannot run inline scripts, so each becomes a file.
    let inlineScripts = 0;
    const page = html.replace(
      /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g,
      (script, attributes = '', contents) => {
        if (/\ssrc=/.test(attributes)) return script;
        const name = `browser-extension-inline-${inlineScripts++}.js`;
        files.push({ relativeDest: name, contents });
        return `<script${attributes} src="/${name}"></script>`;
      },
    );

    // The router reads the path, which would otherwise be /browser-extension.html.
    files.push({
      relativeDest: 'browser-extension-route.js',
      contents: `history.replaceState(null, '', '${APP_ROUTE}' + location.search);`,
    });
    files.push({
      relativeDest: 'browser-extension.html',
      contents: page
        .replaceAll('"/_expo/', '"/expo/')
        .replace(
          /<script([^>]*) src="([^"]+)"><\/script>/g,
          (script, attributes, src) =>
            splitScripts
              .get(src)
              ?.map((part) => `<script${attributes} src="${part}"></script>`)
              .join('') ?? script,
        )
        .replace(
          '<head>',
          '<head><script src="/browser-extension-route.js"></script>',
        ),
    });
  });
});
