import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'running-a-server',
    'setting-up-an-alias',
    {
      type: 'category',
      label: 'Protocol',
      items: ['protocol/overview', 'protocol/data-model', 'protocol/grpc'],
    },
    'contributing',
    'support',
    'privacy-policy',
  ],
};

export default sidebars;
