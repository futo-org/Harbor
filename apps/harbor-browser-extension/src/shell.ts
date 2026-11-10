import { browser } from 'wxt/browser';
import './shell.css';

// Dev frames the Expo dev server so the app hot reloads; builds frame the
// web export packaged into the extension (see modules/harbor-app.ts).
const appUrl = import.meta.env.DEV
  ? `${import.meta.env.WXT_HARBOR_DEV_URL ?? 'http://localhost:8081'}/anywhere`
  : '/anywhere.html';
const appOrigin = new URL(appUrl, location.href).origin;

const frame = document.createElement('iframe');
frame.src = appUrl;
document.body.append(frame);

async function sendPageUrl() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  frame.contentWindow?.postMessage(
    { type: 'harbor-anywhere:url', url: tab?.url },
    appOrigin,
  );
}

// The app asks for the page once it can receive it.
window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return;
  if (event.data?.type === 'harbor-anywhere:ready') sendPageUrl();
});
browser.tabs.onActivated.addListener(sendPageUrl);
browser.tabs.onUpdated.addListener(sendPageUrl);
