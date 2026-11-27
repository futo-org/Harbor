import { APP_DESCRIPTION } from '@/src/common/lib/head';
import { usePathname } from 'expo-router';
import { useHead } from '@/src/common/lib/head/useHead';

/**
 * Names the browser tab, e.g. "Settings / Harbor", for a screen with nothing
 * more to say about itself. Screens with more to describe use `useHead`.
 */
export function usePageTitle(title: string) {
  const path = usePathname();

  useHead({ title, description: APP_DESCRIPTION, path });
}
