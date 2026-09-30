import { toast } from '@/src/common/components/toast';
import { Routes } from '@/src/common/constants';
import type { PolycentricClient } from '@polycentric/react-native';
import { type Href, router } from 'expo-router';

/**
 * Redirects to the home page if the user is already logged in.
 * Returns `true` iff a redirect will be done (caller should abort).
 */
export async function redirectIfLoggedIn(
  client: PolycentricClient,
): Promise<boolean> {
  if (!(await isLoggedIn(client))) return false;

  toast.info("You're already logged in");
  router.dismissTo(Routes.tabs.feed.index as Href);

  return true;
}

async function isLoggedIn(client: PolycentricClient): Promise<boolean> {
  if (client.activeIdentityKey) return true;
  if (!client.currentKeyPair) return false;
  return !!(await client.getIdentityKeyFor(client.currentKeyPair));
}
