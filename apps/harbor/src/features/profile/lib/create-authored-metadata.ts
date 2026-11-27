import { cached } from '@/src/common/lib/page-metadata/cached';
import {
  type Page,
  toMetadata,
  unavailablePage,
} from '@/src/common/lib/page-metadata/page';
import { routeParam } from '@/src/common/lib/page-metadata/route-param';
import type { GenerateMetadataFunction } from 'expo-router/server';
import { type Author, loadAuthor } from './load-author';

/** For a post, claim or calendar event: content at /[identityId]/…/[keyFingerprint]/[sequence] */
export function createAuthoredMetadata(
  unavailableTitle: string,
  toPath: (
    identity: string,
    keyFingerprint: string,
    sequence: string,
  ) => string,
  loadPage: (
    author: Author,
    path: string,
    keyFingerprint: string,
    sequence: bigint,
    signal: AbortSignal,
  ) => Promise<Page | null>,
): GenerateMetadataFunction {
  return async (_request, params) => {
    const identityId = routeParam(params, 'identityId');
    const keyFingerprint = routeParam(params, 'keyFingerprint').toLowerCase();
    const sequence = routeParam(params, 'sequence');
    const path = toPath(identityId, keyFingerprint, sequence);

    const page = await cached(path, async (signal) => {
      if (!/^\d{1,19}$/.test(sequence)) return null;

      const author = await loadAuthor(identityId, signal);
      if (!author || author.sensitive) return null;

      return loadPage(
        author,
        toPath(author.identity, keyFingerprint, sequence),
        keyFingerprint,
        BigInt(sequence),
        signal,
      );
    });

    return toMetadata(page ?? unavailablePage(unavailableTitle, path));
  };
}
