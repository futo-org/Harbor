// Names as in apps/harbor/src/features/anywhere/lib/login-messages.ts
export const LOGIN_PREFIX = 'harbor-browser-extension:login-';
export const NAVIGATE_MESSAGE = 'harbor-browser-extension:navigate';
/** The sign-in messages a Harbor tab sends; the rest go to it. */
export const LOGIN_TAB_MESSAGES = [
  `${LOGIN_PREFIX}ready`,
  `${LOGIN_PREFIX}session`,
  `${LOGIN_PREFIX}cancel`,
];

declare global {
  /** The Harbor site the extension signs in from (see wxt.config.ts). */
  const __HARBOR_APP_URL__: string;
}
