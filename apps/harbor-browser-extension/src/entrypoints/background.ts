import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

// Firefox only, so missing from WXT's Chrome-based `browser` types.
type FirefoxBrowser = { sidebarAction: { toggle(): Promise<void> } };

export default defineBackground(() => {
  if (import.meta.env.FIREFOX) {
    const { sidebarAction } = browser as unknown as FirefoxBrowser;
    browser.action.onClicked.addListener(() => {
      sidebarAction.toggle();
    });
  } else if (!import.meta.env.SAFARI) {
    browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});
