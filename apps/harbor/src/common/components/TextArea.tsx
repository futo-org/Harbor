import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import { Platform, type TextInput as RNTextInput } from 'react-native';
import { TextInput, type TextInputProps } from './primitives/TextInput';

export interface TextAreaProps extends Omit<TextInputProps, 'multiline'> {
  /** Minimum height in pixels. Defaults to 40. */
  minHeight?: number;
}

/**
 * Multiline text input that auto-grows and auto-shrinks with content.
 */
export const TextArea = forwardRef<RNTextInput, TextAreaProps>(
  (
    { minHeight = 20, style, value, scrollEnabled, onChangeText, ...props },
    ref,
  ) => {
    const innerRef = useRef<RNTextInput>(null);
    useImperativeHandle(ref, () => innerRef.current as RNTextInput);

    const autoGrow = useCallback(() => {
      if (Platform.OS !== 'web') return;
      const node = innerRef.current as unknown as HTMLTextAreaElement | null;
      if (!node?.style) return;

      // Save scrolled ancestors' positions: collapsing to `auto` shrinks their
      // content, so the browser clamps them.
      const scrollTopOfAncestors = new Map<HTMLElement, number>();
      for (let el = node.parentElement; el; el = el.parentElement) {
        if (el.scrollTop > 0) scrollTopOfAncestors.set(el, el.scrollTop);
      }

      node.style.height = 'auto';
      node.style.height = `${Math.max(minHeight, node.scrollHeight)}px`;

      // Restore them now that the content has regrown.
      for (const [el, scrollTop] of scrollTopOfAncestors) {
        el.scrollTop = scrollTop;
      }
    }, [minHeight]);

    // Controlled usage: re-measure whenever `value` changes.
    // biome-ignore lint/correctness/useExhaustiveDependencies: `value` retriggers the measure
    useLayoutEffect(autoGrow, [value, autoGrow]);

    return (
      <TextInput
        ref={innerRef}
        multiline
        textAlignVertical="top"
        value={value}
        // Uncontrolled usage: `value` never changes, so measure per keystroke.
        onChangeText={(next) => {
          onChangeText?.(next);
          autoGrow();
        }}
        style={[
          { minHeight },
          Platform.OS === 'web'
            ? // Suppress the corner resize grip and the vertical
              // scrollbar — we drive height via scrollHeight.
              ({ resize: 'none', overflow: 'hidden' } as object)
            : {},
          style,
        ]}
        {...props}
      />
    );
  },
);

TextArea.displayName = 'TextArea';
