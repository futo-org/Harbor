import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Platform,
  type TextInput as RNTextInput,
  type TextInputContentSizeChangeEventData,
  type NativeSyntheticEvent,
  TextInputContentSizeChangeEvent,
} from 'react-native';
import { TextInput, type TextInputProps } from './primitives/TextInput';

export interface TextAreaProps extends Omit<TextInputProps, 'multiline'> {
  /** Minimum height in pixels. Defaults to 40. */
  minHeight?: number;
}

/**
 * Multiline text input that auto-grows and auto-shrinks with content.
 */
export const TextArea = forwardRef<RNTextInput, TextAreaProps>(
  ({ minHeight = 20, style, value, scrollEnabled, ...props }, ref) => {
    const innerRef = useRef<RNTextInput>(null);
    useImperativeHandle(ref, () => innerRef.current as RNTextInput);

    // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever `value` changes
    useLayoutEffect(() => {
      if (Platform.OS !== 'web') return;
      const node = innerRef.current as unknown as HTMLTextAreaElement | null;
      if (!node?.style) return;
      node.style.height = 'auto';
      node.style.height = `${Math.max(minHeight, node.scrollHeight)}px`;
    }, [value, minHeight]);

    return (
      <TextInput
        ref={innerRef}
        multiline
        textAlignVertical="top"
        value={value}
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
