import { Platform } from 'react-native';

export const isWeb = Platform.OS === 'web';
export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';

// Framed by the browser extension (apps/harbor-browser-extension)
export const isBrowserExtension =
  isWeb &&
  typeof window !== 'undefined' &&
  window.parent !== window &&
  window.location.pathname === '/anywhere/browser-extension/panel';

// Apple keyboards use Cmd for shortcuts. Same check as prosemirror-keymap.
export const isApplePlatform =
  isWeb && /Mac|iP(hone|[oa]d)/.test(navigator.platform);

// Mouse or trackpad as the primary input (typical desktop), not touch
export const hasPointerHover =
  isWeb &&
  typeof window !== 'undefined' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;
