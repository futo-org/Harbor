import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'running-a-server',
    'setting-up-an-alias',
    {
      type: 'category',
      label: 'Polycentric Protocol',
      items: [
        'protocol/overview',
        'protocol/data-model',
        'protocol/grpc',
        'protocol/server-auth',
      ],
    },
    {
      type: 'category',
      label: 'Verifiers',
      items: [
        'verifiers/overview',
        'verifiers/platforms',
        'verifiers/self-hosting',
        'verifiers/creating-a-verifier',
      ],
    },
    {
      type: 'category',
      label: 'Development',
      items: ['development/setup', 'development/project-structure'],
    },
    'contributing',
    'support',
    'privacy-policy',
  ],
};

export default sidebars;
