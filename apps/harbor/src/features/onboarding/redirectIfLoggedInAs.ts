import { toast } from '@/src/common/components/toast';
import { Routes } from '@/src/common/constants';
import type { PolycentricClient } from '@polycentric/react-native';
import { type Href, router } from 'expo-router';

/**
 * Redirects to the home page if the user already has a login for `identity`.
 * Returns `true` iff a redirect will be done (caller should abort).
 */
export async function redirectIfLoggedInAs(
  client: PolycentricClient,
  identity: string,
): Promise<boolean> {
  const logins = await client.storage.logins.listLogins(identity);

  const hasLiveLogin = logins.some(
    ({ status }) => status === 'liveRotationKey' || status === 'liveSigningKey',
  );

  if (!hasLiveLogin) return false;

  // We found a live login for `identity`, so we should redirect
  toast.info('This device already has a login for that identity');
  router.dismissTo(Routes.tabs.feed.index as Href);
  return true;
}
