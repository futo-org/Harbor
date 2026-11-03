const { getDefaultConfig } = require('expo/metro-config');

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

module.exports = config;
