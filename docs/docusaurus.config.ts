import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Polycentric Docs',
  tagline: 'An open-source, distributed social network',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  url: 'https://docs.polycentric.io',
  baseUrl: '/',

  organizationName: 'FUTO',
  projectName: 'polycentric',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          // Markdown content lives in ./content (not the Docusaurus default ./docs).
          path: 'content',
          // Serve docs at the site root; there is no separate landing page.
          routeBasePath: '/',
          sidebarPath: './src/sidebars.ts',
        },
        // No blog.
        blog: false,
        theme: {
          customCss: './src/custom.css',
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
      title: 'Polycentric Docs',
      logo: {
        alt: 'Polycentric',
        src: 'img/logo.png',
        srcDark: 'img/logo-dark.png',
      },
      items: [
        {
          href: 'https://gitlab.futo.org/polycentric/polycentric',
          label: 'Project Repository',
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
            { label: 'Web app', href: 'https://polycentric.io' },
            {
              label: 'Android APK',
              href: 'https://gitlab.futo.org/polycentric/polycentric/-/releases/permalink/latest/downloads/polycentric-android.apk',
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
            { label: 'Introduction', to: '/' },
            { label: 'Running a Server', to: '/running-a-server' },
            { label: 'Protocol', to: '/protocol/overview' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'Chat', href: 'https://chat.futo.org' },
            {
              label: 'Feed',
              href: 'https://polycentric.io/feed/Polycentric%20Official/CiCGet0WuZW24rZ7NeP7gM2Z2jI55wctOhP-qpu9Onl1jBIbaHR0cHM6Ly9zcnYxLnBvbHljZW50cmljLmlv',
            },
          ],
        },
        {
          title: 'More',
          items: [
            { label: 'App', href: 'https://polycentric.io' },
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
