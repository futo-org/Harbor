import type {
  TextInputInstance,
  TextInputSelectionChangeEvent,
} from 'react-native';
import { useEffect } from 'react';
import { isWeb } from '@/src/common/util/platform';
import { useMentionStoreApi } from '@/src/features/composer/hooks/useMentionStore';
import { useComposerStore } from '@/src/features/composer/hooks/useComposerStore';

/**
 * Wires the composer input into its host's mention store: mirrors the draft
 * text and its mention ranges, registers the native ref + text sync, measures
 * the input's page position while the route is focused, and hands back the
 * TextArea event handlers that keep selection/focus/layout live.
 */
export function useMentionInputSync({
  text,
  onChangeText,
  inputRef,
}: {
  text: string;
  onChangeText: (next: string, caret?: number) => void;
  inputRef: React.RefObject<TextInputInstance | null>;
}) {
  const store = useMentionStoreApi();
  // Updated together with `text` by the draft store's `setText`
  const mentionRanges = useComposerStore((s) => s.mentionRanges);

  useEffect(() => {
    // Web: `text` comes from the DOM `input` event and React flushes this
    // effect synchronously inside it, before the `select` event has updated
    // `selection`. Writing only `text` would leave one render with the new
    // text against the old caret, which `findMentionContext` reads as a
    // mid-word caret (overlay blinks). The DOM node's selection is already
    // current, so write both at once. Native delivers both events in one
    // batch, so selection is never stale there.
    const node = isWeb
      ? (inputRef.current as unknown as HTMLTextAreaElement | null)
      : null;
    store.setState(
      node
        ? {
            text,
            mentionRanges,
            selection: { start: node.selectionStart, end: node.selectionEnd },
          }
        : { text, mentionRanges },
    );
  }, [store, text, mentionRanges, inputRef]);

  useEffect(() => {
    store.setState({ onChangeText });
    return () => store.setState({ onChangeText: null });
  }, [store, onChangeText]);

  // No deps: the TextArea can remount (autoFocus re-key), which swaps
  // `inputRef.current` without any state change — refresh after every commit.
  useEffect(() => {
    store.setState({ inputRef: inputRef.current });
  });
  useEffect(() => () => store.setState({ inputRef: null }), [store]);

  const { setSelection, setIsFocused, setInputLayout, measureInput } =
    store.getState();

  return {
    onSelectionChange: (e: TextInputSelectionChangeEvent) =>
      setSelection(e.nativeEvent.selection),
    onFocus: () => {
      setIsFocused(true);
      // Warm-up measure so the overlay's first frame is usually right; the
      // overlay re-measures on open for the settled layout.
      measureInput();
    },
    onBlur: () => setIsFocused(false),
    setInputLayout,
  };
}
