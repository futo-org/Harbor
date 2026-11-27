import { APP_NAME } from '@/src/common/constants';
import { createFixedMetadata } from '@/src/common/lib/page-metadata/create-fixed-metadata';
import { toMetadata } from '@/src/common/lib/page-metadata/page';
import { routeParam } from '@/src/common/lib/page-metadata/route-param';
import { truncateText } from '@/src/common/util/truncateText';
import type { GenerateMetadataFunction } from 'expo-router/server';

/** The posts about a web page, at /anywhere/u/[domain]/[...path] */
export const anywhereUrlMetadata: GenerateMetadataFunction = (
  request,
  params,
) => {
  const target = [routeParam(params, 'domain'), routeParam(params, 'path')]
    .filter(Boolean)
    .join('/');

  return toMetadata({
    title: `Comments on ${truncateText(target, 80)}`,
    description: `See what people on ${APP_NAME} are saying about ${truncateText(target, 120)}.`,
    path: request ? new URL(request.url).pathname : `/anywhere/u/${target}`,
  });
};

export const anywhereMetadata = createFixedMetadata(
  '/anywhere',
  'Anywhere',
  'Discuss any page on the web. See what people on Harbor are saying about the links they share.',
);

export const anywhereBrowserExtensionMetadata = createFixedMetadata(
  '/anywhere/browser-extension',
  'Browser extension',
  'Get the Harbor browser extension to read and join the conversation about the page you are on.',
);
