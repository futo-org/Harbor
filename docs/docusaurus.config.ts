import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import tailwindPostcss from '@tailwindcss/postcss';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Harbor',
  tagline: 'Share to the world, not platforms.',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: {
      removeLegacyPostBuildHeadAttribute: true,
      // The cascade-layers polyfill boosts Infima's specificity above
      // custom.css, so :root overrides there never apply.
      useCssCascadeLayers: false,
    },
  },

  url: 'https://join.harbor.social',
  baseUrl: '/',

  organizationName: 'FUTO',
  projectName: 'polycentric',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    // Tailwind (v4) for the landing pages; docs pages stay on Infima.
    async function tailwindPlugin() {
      return {
        name: 'tailwind-plugin',
        configurePostCss(postcssOptions) {
          postcssOptions.plugins.push(tailwindPostcss);
          return postcssOptions;
        },
      };
    },
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          // Markdown content lives in ./content (not the Docusaurus default ./docs).
          path: 'content',
          // The landing page lives at the site root (src/pages/index.tsx);
          // docs are served under /docs.
          routeBasePath: 'docs',
          sidebarPath: './src/sidebars.ts',
        },
        // No blog.
        blog: false,
        theme: {
          customCss: ['./src/tailwind.css', './src/custom.css'],
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      // Default to dark, but still honor the user's stored/OS preference and
      // keep the toggle.
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
      disableSwitch: false,
    },
    navbar: {
      title: 'Harbor',
      logo: {
        alt: 'Harbor',
        src: 'img/logo.png',
        srcDark: 'img/logo-dark.png',
      },
      items: [
        {
          to: '/apps',
          label: 'Apps',
          position: 'right',
        },
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          label: 'Docs',
          position: 'right',
        },
        {
          href: 'https://gitlab.futo.org/harbor/harbor',
          label: 'Code',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Download',
          items: [
            { label: 'Web app', href: 'https://harbor.social' },
            {
              label: 'Android APK',
              href: 'https://static.harbor.social/apk/production/harbor-latest.apk',
            },
            {
              label: 'iOS (TestFlight)',
              href: 'https://testflight.apple.com/join/bZ8py7Ny',
            },
          ],
        },
        {
          title: 'Docs',
          items: [
            { label: 'Introduction', to: '/docs' },
            { label: 'Host a Server', to: '/docs/guides/running-a-server' },
            { label: 'Protocol', to: '/docs/protocol/overview' },
          ],
        },
        {
          title: 'Community',
          items: [{ label: 'Chat', href: 'https://chat.futo.org' }],
        },
        {
          title: 'More',
          items: [
            { label: 'App', href: 'https://harbor.social' },
            {
              label: 'GitLab',
              href: 'https://gitlab.futo.org/polycentric/polycentric',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} FUTO Holdings, Inc.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['protobuf', 'bash'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
