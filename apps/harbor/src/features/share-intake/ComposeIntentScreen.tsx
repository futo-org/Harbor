import { Routes } from '@/src/common/constants';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { joinSharedText } from './joinSharedText';
import { usePendingShareStore } from './usePendingShareStore';
import { useShareDebugStore } from './useShareDebugStore';

// `/intent/compose?text=...&url=...`: the public link that opens the composer
// with `text` prefilled and `url` on its own line after it
export default function ComposeIntentScreen() {
  const { text, url } = useLocalSearchParams<{
    text?: string | string[];
    url?: string | string[];
  }>();

  const sharedUrl = readFirstParam(url);
  const sharedText = joinSharedText(
    [readFirstParam(text) ?? ''],
    sharedUrl ? [sharedUrl] : [],
  );

  useEffect(() => {
    usePendingShareStore
      .getState()
      .setPendingShare({ text: sharedText, images: [] });

    useShareDebugStore.getState().setShareDebugInfo({
      source: 'web link',
      launch: null,
      receivedAt: Date.now(),
      rawPayloads: [],
      failedImages: [],
    });

    router.replace(Routes.shareDebug);
  }, [sharedText]);

  return null;
}

function readFirstParam(param: string | string[] | undefined) {
  return Array.isArray(param) ? param[0] : param;
}
