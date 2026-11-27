import { APP_NAME } from '@/src/common/constants';
import type { Head } from '@/src/common/lib/head';
import { truncateText } from '@/src/common/util/truncateText';

export const anywhereHead: Head = {
  title: 'Anywhere',
  description: `Discuss any page on the web. See what people on ${APP_NAME} are saying about the links they share.`,
  path: '/anywhere',
};

export const anywhereBrowserExtensionHead: Head = {
  title: 'Browser extension',
  description: `Get the ${APP_NAME} browser extension to read and join the conversation about the page you are on.`,
  path: '/anywhere/browser-extension',
};

export type AnywhereUrlHeadInput = {
  /** The app's path for the web page, /anywhere/u/… */
  path: string;
  /** The web page's address without its scheme, e.g. example.com/a */
  target: string;
  /** The web page's own title, when it is known */
  linkTitle?: string;
};

/** The posts about a web page */
export function anywhereUrlHead({
  path,
  target,
  linkTitle,
}: AnywhereUrlHeadInput): Head {
  return {
    title: `Comments on ${truncateText(linkTitle || target, 80)}`,
    description: `See what people on ${APP_NAME} are saying about ${truncateText(target, 120)}.`,
    path,
  };
}
