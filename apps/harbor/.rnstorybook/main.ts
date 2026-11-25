import type { StorybookConfig } from '@storybook/react-native';

const main: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  deviceAddons: [
    // Wraps @storybook/addon-ondevice-controls
    './controls',
    '@storybook/addon-ondevice-actions',
  ],
};

export default main;
