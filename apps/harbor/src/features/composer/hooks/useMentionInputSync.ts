import type {
  TextInput,
  TextInputSelectionChangeEvent,
  LayoutChangeEvent,
} from 'react-native';
import { useEffect } from 'react';
import { useMentionStoreApi } from '@/src/features/composer/hooks/useMentionStore';

/**
 * Wires the composer input into its host's mention store: mirrors the draft
 * text, registers the native ref + text sync, measures the input's page
 * position while the route is focused, and hands back the TextArea event
 * handlers that keep selection/focus/layout live.
 */
export function useMentionInputSync({
  text,
  onChangeText,
  inputRef,
}: {
  text: string;
  onChangeText: (next: string) => void;
  inputRef: React.RefObject<TextInput | null>;
}) {
  const store = useMentionStoreApi();

  useEffect(() => {
    store.setState({ text });
  }, [store, text]);

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
    onLayout: (e: LayoutChangeEvent) => setInputLayout(e.nativeEvent.layout),
  };
}
