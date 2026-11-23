import { isWeb } from '@/src/common/util/platform';
import { type Href, Link, router } from 'expo-router';
import { type ComponentRef, useCallback } from 'react';
import type { GestureResponderEvent, View } from 'react-native';

/**
 * Link behavior for a card that can't be an anchor because it holds links
 * and buttons: a plain click runs `onPress`, then navigates to `destination`,
 * while on web Cmd/Ctrl-click and middle-click open `destination` in a new
 * tab without running `onPress`. Without `destination`, it's a plain
 * `onPress`.
 *
 * Spread the result on the card's `Pressable`.
 */
export function useCardLinkPress(
  destination: Href | null | undefined,
  onPress?: () => void,
) {
  const url = destination ? Link.resolveHref(destination) : undefined;

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      // On web, RNW passes the click's MouseEvent.
      const { metaKey, ctrlKey } = event.nativeEvent as unknown as MouseEvent;
      if (isWeb && url && (metaKey || ctrlKey)) {
        window.open(url, '_blank');
        return;
      }
      onPress?.();
      if (destination) router.navigate(destination);
    },
    [destination, url, onPress],
  );

  // Middle-click fires `auxclick`, which RNW's Pressable doesn't handle.
  const ref = useCallback(
    (view: ComponentRef<typeof View> | null) => {
      if (!isWeb || !view || !url) return;
      const card = view as unknown as HTMLElement;

      const handleMouseDown = (event: MouseEvent) => {
        // Keep the browser's autoscroll cursor from starting.
        if (event.button === 1 && isOnCardItself(event, card)) {
          event.preventDefault();
        }
      };
      const handleAuxClick = (event: MouseEvent) => {
        if (event.button === 1 && isOnCardItself(event, card)) {
          window.open(url, '_blank');
        }
      };

      card.addEventListener('mousedown', handleMouseDown);
      card.addEventListener('auxclick', handleAuxClick);
      return () => {
        card.removeEventListener('mousedown', handleMouseDown);
        card.removeEventListener('auxclick', handleAuxClick);
      };
    },
    [url],
  );

  return { ref, onPress: handlePress };
}

/**
 * False when the event comes from a link or another pressable inside the card,
 * which handle their own clicks. RNW gives enabled pressables a `tabindex`.
 */
function isOnCardItself(event: MouseEvent, card: HTMLElement) {
  const control = (event.target as Element).closest('a, button, [tabindex]');
  return !control || control === card || !card.contains(control);
}
