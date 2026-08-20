import { APP_NAME } from '@/src/common/constants';
import { isWeb } from '@/src/common/util/platform';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

/**
 * Names the browser tab while the screen is focused, e.g. "Explore / Harbor".
 * Blur restores the plain app name, so screens without a title keep it.
 */
export function usePageTitle(title: string) {
  useFocusEffect(
    useCallback(() => {
      if (!isWeb) return;
      document.title = `${title} / ${APP_NAME}`;
      return () => {
        document.title = APP_NAME;
      };
    }, [title]),
  );
}
