import { Routes } from '@/src/common/constants';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { usePendingShareStore } from './usePendingShareStore';
import { useShareDebugStore } from './useShareDebugStore';

// `/intent/compose?text=...`: the public link that opens the composer with
// `text` prefilled
export default function ComposeIntentScreen() {
  const { text } = useLocalSearchParams<{ text?: string | string[] }>();
  const sharedText = (Array.isArray(text) ? text[0] : text) ?? '';

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
