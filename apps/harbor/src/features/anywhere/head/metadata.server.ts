import { createFixedMetadata } from '@/src/common/lib/head/create-fixed-metadata.server';
import { toMetadata } from '@/src/common/lib/head';
import { routeParam } from '@/src/common/lib/head/route-param.server';
import type { GenerateMetadataFunction } from 'expo-router/server';
import {
  anywhereBrowserExtensionHead,
  anywhereHead,
  anywhereUrlHead,
} from './index';

export const anywhereMetadata = createFixedMetadata(anywhereHead);

export const anywhereBrowserExtensionMetadata = createFixedMetadata(
  anywhereBrowserExtensionHead,
);

/** At /anywhere/u/[domain]/[...path] */
export const anywhereUrlMetadata: GenerateMetadataFunction = (
  request,
  params,
) => {
  const target = [routeParam(params, 'domain'), routeParam(params, 'path')]
    .filter(Boolean)
    .join('/');

  return toMetadata(
    anywhereUrlHead({
      path: request ? new URL(request.url).pathname : `/anywhere/u/${target}`,
      target,
    }),
  );
};
