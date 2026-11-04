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
  // If the current session already has identity information loaded, then we
  // can just navigate away.
  if (client.activeIdentityKey) {
    toast.info("You're already logged in");
    router.dismissTo(Routes.tabs.feed.index as Href);
    return true;
  }

  // Every tab shares one client, but this tab's snapshot may not have caught
  // up with a sign-in that just happened elsewhere; ask the client itself.
  const snapshot = await client.harbor.snapshot();
  if (!snapshot.login) return false;

  toast.info("You're already logged in");
  router.dismissTo(Routes.tabs.feed.index as Href);
  return true;
}
