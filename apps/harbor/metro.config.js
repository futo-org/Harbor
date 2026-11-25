const { getDefaultConfig } = require('expo/metro-config');
const {
  withStorybook,
} = require('@storybook/react-native/metro/withStorybook');

// withStorybook sends a telemetry event on every start unless this is set; it
// ignores `core.disableTelemetry`
process.env.STORYBOOK_DISABLE_TELEMETRY = 'true';

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// Maestro writes reports here during runs. In SDK 58 any watched file change
// mid-render breaks dev server rendering (expo/expo#51871).
config.resolver.blockList = [
  ...config.resolver.blockList,
  /[\\/]e2e[\\/]reports[\\/]/,
];

// Disabled, it resolves every Storybook import to an empty module, which keeps
// it out of non-dev bundles
module.exports = withStorybook(config, {
  enabled: process.env.APP_VARIANT === 'dev',
});
