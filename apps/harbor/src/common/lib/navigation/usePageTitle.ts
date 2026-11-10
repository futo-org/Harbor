import { APP_NAME } from '@/src/common/constants';
import { isWeb } from '@/src/common/util/platform';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

/**
 * Names the browser tab when the screen gains focus, e.g. "Explore / Harbor".
 * Blur leaves it as is: resetting it would flash the plain app name before
 * the next screen sets its own, so screens without a title keep the last one.
 */
export function usePageTitle(title: string) {
  useFocusEffect(
    useCallback(() => {
      if (!isWeb) return;
      document.title = `${title} / ${APP_NAME}`;
    }, [title]),
  );
}
