import {
  Platform,
  StyleSheet,
  TextInput as RNTextInput,
  type TextInputInstance,
  type TextInputProps as RNTextInputProps,
  type TextStyle,
} from 'react-native';
import { forwardRef, useState } from 'react';
import {
  Atoms,
  BorderRadius,
  type BorderRadiusToken,
  type FontSizeToken,
  type LineHeightToken,
  type TextColor,
  typography,
  useTheme,
} from '@/src/common/theme';
import { BlurView } from 'expo-blur';
import {
  NATIVE_FONTS,
  NATIVE_MONOSPACE_FONTS,
  WEB_FONT_STACK,
  WEB_MONOSPACE_FONT_STACK,
} from './Text';

export interface TextInputProps
  extends Omit<RNTextInputProps, 'placeholderTextColor'> {
  variant?: 'default' | 'plain';
  rounded?: BorderRadiusToken;
  fontSize?: FontSizeToken;
  lineHeight?: LineHeightToken;
  monospace?: boolean;
  placeholderTextColor?: TextColor;
  disabled?: boolean;
  error?: boolean;
}

export const TextInput = forwardRef<TextInputInstance, TextInputProps>(
  (
    {
      numberOfLines,
      multiline,
      style,
      placeholderTextColor = 'muted',
      variant = 'default',
      rounded = 'md',
      fontSize = 'md',
      lineHeight = 'md',
      monospace = false,
      disabled = false,
      error = false,
      autoCorrect = false,
      autoCapitalize,
      onFocus,
      onBlur,
      ...props
    },
    ref,
  ) => {
    const { theme } = useTheme();
    const isDark = theme.scheme === 'dark';

    const [isFocused, setIsFocused] = useState(false);
    const isPlain = variant === 'plain';

    const fontFamily =
      Platform.OS === 'web'
        ? monospace
          ? WEB_MONOSPACE_FONT_STACK
          : // As in `Text`, so typed emoji are Twemoji too.
            WEB_FONT_STACK
        : (monospace ? NATIVE_MONOSPACE_FONTS : NATIVE_FONTS)['400'];

    const baseStyle: TextStyle = {
      paddingVertical: 12,
      paddingHorizontal: 12,
      fontFamily,
      fontSize: typography.fontSize[fontSize],
      lineHeight: typography.lineHeight[lineHeight],
      // Android pads the placeholder by the font's bounding box, which for the
      // variable NotoSans overflows the input and top-aligns the placeholder.
      ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
      ...(Platform.OS === 'web'
        ? { ...Atoms.outline_none, resize: 'none' }
        : null),
    };

    const multilineStyle: TextStyle = multiline
      ? {
          ...(numberOfLines && {
            minHeight: numberOfLines * typography.lineHeight[lineHeight],
          }),
          textAlignVertical: 'top',
        }
      : {};

    const input = (
      <RNTextInput
        ref={ref}
        editable={!disabled}
        autoCorrect={autoCorrect}
        autoCapitalize={autoCapitalize ?? (autoCorrect ? 'sentences' : 'none')}
        multiline={multiline}
        numberOfLines={numberOfLines}
        style={[
          baseStyle,
          disabled ? [theme.atoms.muted, Atoms.faded] : theme.atoms.primary,
          multilineStyle,
          style,
        ]}
        placeholderTextColor={theme.colors[placeholderTextColor]}
        selectionColor={theme.colors.accent}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        {...props}
      />
    );

    if (isPlain) {
      return input;
    }

    return (
      <BlurView
        intensity={40}
        tint={isDark ? 'dark' : 'light'}
        style={[
          styles.blurContainer,
          Atoms.border,
          { borderRadius: BorderRadius[rounded] },
          error
            ? theme.atoms.box.danger.border
            : isFocused
              ? theme.atoms.outline_strong
              : theme.atoms.outline,
        ]}
      >
        {input}
      </BlurView>
    );
  },
);

TextInput.displayName = 'TextInput';

const styles = StyleSheet.create({
  blurContainer: {
    overflow: 'hidden',
  },
});
