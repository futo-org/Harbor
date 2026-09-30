import { toast } from '@/src/common/components/toast';
import { Routes } from '@/src/common/constants';
import { isWeb } from '@/src/common/util/platform';
import type { PolycentricClient } from '@polycentric/react-native';
import { type Href, router } from 'expo-router';

/**
 * Redirects to the home page if the user is already logged in.
 * Returns `true` iff a redirect will be done (caller should abort).
 */
export async function redirectIfLoggedIn(
  client: PolycentricClient,
): Promise<boolean> {
  // If the current session already has identity information loaded, then we
  // can just navigate away.
  if (client.activeIdentityKey) {
    toast.info("You're already logged in");
    router.dismissTo(Routes.tabs.feed.index as Href);
    return true;
  }

  // Don't redirect if even local storage doesn't have identity information
  if (!client.currentKeyPair) return false;
  if (!(await client.getIdentityKeyFor(client.currentKeyPair))) return false;

  // Local storage has identity information but our polycentric client does not.
  // On web, another tab could have updated the local storage beyond what we
  // have loaded in-memory.
  // In this case, we need to trigger a full page load.
  if (isWeb) window.location.assign(Routes.tabs.feed.index);
  else router.dismissTo(Routes.tabs.feed.index as Href);

  return true;
}
