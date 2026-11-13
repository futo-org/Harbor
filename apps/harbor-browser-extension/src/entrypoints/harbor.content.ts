import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { LOGIN_PREFIX, LOGIN_TAB_MESSAGES, NAVIGATE_MESSAGE } from '../login';

// Runs in Harbor tabs, passing messages between the extension and
// the page (apps/harbor/src/features/anywhere/lib/login-messages.ts).
export default defineContentScript({
  matches: [`${__HARBOR_APP_URL__}/*`],
  // Before the site's scripts, which read the mark below.
  runAt: 'document_start',
  main() {
    // Tells the site the extension is installed.
    document.documentElement.dataset.harborBrowserExtension = '';
    browser.runtime.onMessage.addListener((message) => {
      const type = message?.type;
      if (typeof type !== 'string') return;
      if (!type.startsWith(LOGIN_PREFIX) && type !== NAVIGATE_MESSAGE) return;
      window.postMessage(message, location.origin);
    });
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (!LOGIN_TAB_MESSAGES.includes(event.data?.type)) return;
      // Fails when the extension is not open to hear it.
      browser.runtime.sendMessage(event.data).catch(() => {});
    });
  },
});
