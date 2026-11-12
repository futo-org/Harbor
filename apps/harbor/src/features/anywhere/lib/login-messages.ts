// Messages for signing the extension in by pairing with a Harbor tab.
// Names as in apps/harbor-browser-extension/src.

/** App to extension: open the Harbor site at `path`, to sign up or log in there. */
export const OPEN_SITE_MESSAGE = 'harbor-browser-extension:open-site';
/** Extension to tab: go to `path` on the site, without reloading it. */
export const NAVIGATE_MESSAGE = 'harbor-browser-extension:navigate';
/** Tab to extension: the tab has loaded, and can be asked. */
export const LOGIN_READY_MESSAGE = 'harbor-browser-extension:login-ready';
/** Extension to tab: asks to be signed in. */
export const LOGIN_REQUEST_MESSAGE = 'harbor-browser-extension:login-request';
/** Tab to extension: the pairing session to claim, as `code`. */
export const LOGIN_SESSION_MESSAGE = 'harbor-browser-extension:login-session';
/** Tab to extension: that session was denied, or failed. */
export const LOGIN_CANCEL_MESSAGE = 'harbor-browser-extension:login-cancel';
