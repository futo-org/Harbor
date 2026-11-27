import { applyHead } from './apply-head';
import type { Head } from './index';
import { isWeb } from '@/src/common/util/platform';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

/**
 * Gives the document the title and tags of `head` when the screen gains
 * focus: the same `Head` its route's `generateMetadata` serves, so a screen
 * reached by navigating reads like one loaded from the server.
 *
 * Null leaves the document as it is, for a screen whose content is still
 * loading. Blur leaves it too: the next screen sets its own.
 */
export function useHead(head: Head | null) {
  // A new object each render, so effects key on what it says
  const headKey = head ? JSON.stringify(head) : null;

  useFocusEffect(
    useCallback(() => {
      if (!isWeb || !headKey) return;

      applyHead(JSON.parse(headKey));
    }, [headKey]),
  );
}
