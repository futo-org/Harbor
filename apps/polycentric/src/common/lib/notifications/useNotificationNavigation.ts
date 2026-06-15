import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

/**
 * Navigate in response to a tapped push notification. The notifications
 * service attaches a deep-link URL as `data.url`
 * (e.g. `polycentric:///{identity}/post/{keyFingerprint}/{sequence}` or
 * `polycentric:///{identity}`); we parse its path and route to it in-app.
 */
function navigateFromResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data;
  const url = typeof data?.url === 'string' ? data.url : undefined;
  if (!url) return;

  // `polycentric:///id/post/fp/seq` -> path "id/post/fp/seq" -> route "/id/post/fp/seq".
  const { path } = Linking.parse(url);
  if (!path) return;

  router.push(`/${path}` as never);
}

/**
 * Wire up navigation for notification taps. Handles both a tap while the app
 * is running/backgrounded and a tap that cold-starts the app.
 *
 * `ready` must be `true` only once the router is mounted (i.e. the provider
 * has finished initializing and is rendering the navigation tree), otherwise
 * `router.push` has no navigator to act on and the navigation is silently lost.
 */
export function useNotificationNavigation(ready: boolean) {
  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    // Cold start: the app was launched by tapping a notification.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && !cancelled) navigateFromResponse(response);
    });

    // Warm: tapped while the app was already running or backgrounded.
    const subscription =
      Notifications.addNotificationResponseReceivedListener(
        navigateFromResponse,
      );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [ready]);
}
