import { browser } from 'wxt/browser';
import { LOGIN_PREFIX, LOGIN_TAB_MESSAGES, NAVIGATE_MESSAGE } from './login';
import { canonicalUrl, pageMeta } from './page';
import './shell.css';

// Dev frames the Expo dev server so the app hot reloads; builds frame the
// web export packaged into the extension (see modules/harbor-app.ts). On
// 127.0.0.1 rather than localhost, so the framed app has its own storage and
// identity as a build does, apart from the Harbor tab's.
const appUrl = import.meta.env.DEV
  ? `${import.meta.env.WXT_HARBOR_DEV_URL ?? 'http://127.0.0.1:8081'}/anywhere/browser-extension/panel`
  : '/browser-extension.html';
const appOrigin = new URL(appUrl, location.href).origin;

const frame = document.createElement('iframe');
frame.src = appUrl;
document.body.append(frame);

let sends = 0;

async function sendPageUrl() {
  const send = ++sends;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  // The app treats the Harbor site's own pages as what they show.
  const site = tab?.url && URL.canParse(tab.url) ? new URL(tab.url) : undefined;
  const sitePath =
    site?.origin === __HARBOR_APP_URL__ ? site.pathname : undefined;
  const meta = tab?.id && site && !sitePath ? await pageMeta(tab.id) : {};
  // A later call has the tab as it is now; a slow page must not undo it.
  if (send !== sends) return;
  frame.contentWindow?.postMessage(
    {
      type: 'harbor-browser-extension:url',
      url: tab?.url && canonicalUrl(tab.url, meta.canonical),
      title: tab?.title,
      description: meta.description,
      image: meta.image,
      sitePath,
    },
    appOrigin,
  );
}

/** The active tab, when it is on the Harbor site. */
async function harborTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !URL.canParse(tab.url)) return undefined;
  return new URL(tab.url).origin === __HARBOR_APP_URL__ ? tab : undefined;
}

// Signing in goes through the Harbor tab the extension is open beside.
async function sendToHarborTab(message: unknown) {
  const tab = await harborTab();
  // Fails in a tab that was open before the extension was installed.
  if (tab?.id) browser.tabs.sendMessage(tab.id, message).catch(() => {});
}

/** Opens a Harbor page in the tab, if it is on Harbor, else in a new one. */
async function openSite(url: URL) {
  const tabId = (await harborTab())?.id;
  if (!tabId) {
    browser.tabs.create({ url: url.href });
    return;
  }
  // The site moves itself, without a reload. A tab that was open before the
  // extension was installed cannot hear it, and is sent there instead.
  browser.tabs
    .sendMessage(tabId, {
      type: NAVIGATE_MESSAGE,
      path: url.pathname + url.search,
    })
    .catch(() => browser.tabs.update(tabId, { url: url.href }));
}

window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return;
  const type = event.data?.type;
  // The app asks for the page once it can receive it.
  if (type === 'harbor-browser-extension:ready') sendPageUrl();
  else if (type === 'harbor-browser-extension:open-site') {
    const url = new URL(String(event.data.path), __HARBOR_APP_URL__);
    if (url.origin === __HARBOR_APP_URL__) openSite(url);
  } else if (typeof type === 'string' && type.startsWith(LOGIN_PREFIX))
    sendToHarborTab(event.data);
});
browser.runtime.onMessage.addListener((message, sender) => {
  if (!LOGIN_TAB_MESSAGES.includes(message?.type)) return;
  if (!sender.tab?.url?.startsWith(`${__HARBOR_APP_URL__}/`)) return;
  frame.contentWindow?.postMessage(message, appOrigin);
});
browser.tabs.onActivated.addListener(sendPageUrl);
browser.tabs.onUpdated.addListener((_tabId, change) => {
  sendPageUrl();
  // Single-page apps change their canonical link after the address.
  if (change.url) setTimeout(sendPageUrl, 1000);
});
