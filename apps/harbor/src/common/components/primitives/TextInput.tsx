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
  BorderRadius,
  type BorderRadiusToken,
  type FontSizeToken,
  type LineHeightToken,
  type PaletteColorToken,
  typography,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import { BlurView } from 'expo-blur';
import {
  NATIVE_FONT_FAMILY,
  NATIVE_MONOSPACE_FONT_FAMILY,
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
  placeholderTextColor?: PaletteColorToken;
  disabled?: boolean;
  error?: boolean;
}

export const TextInput = forwardRef<TextInputInstance, TextInputProps>(
  (
    {
      numberOfLines,
      multiline,
      style,
      placeholderTextColor,
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
        : monospace
          ? NATIVE_MONOSPACE_FONT_FAMILY
          : NATIVE_FONT_FAMILY;

    const baseStyle: TextStyle = {
      paddingVertical: 12,
      paddingHorizontal: 12,
      fontFamily,
      fontSize: typography.fontSize[fontSize],
      lineHeight: typography.lineHeight[lineHeight],
      color: disabled ? theme.palette.neutral_500 : theme.palette.neutral_900,
      opacity: disabled ? 0.5 : 1,
      // Android pads the placeholder by the font's bounding box, which for the
      // variable NotoSans overflows the input and top-aligns the placeholder.
      ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
      ...(Platform.OS === 'web'
        ? ({
            outlineStyle: 'none',
            outlineWidth: 0,
            resize: 'none',
          } as unknown as TextStyle)
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
        style={[baseStyle, multilineStyle, style]}
        placeholderTextColor={
          placeholderTextColor
            ? theme.palette[placeholderTextColor]
            : theme.palette.neutral_500
        }
        selectionColor={theme.palette.primary_500}
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
          {
            borderRadius: BorderRadius[rounded],
            borderColor: error
              ? withHexOpacity(theme.palette.negative_500, '80')
              : isFocused
                ? theme.palette.neutral_500
                : withHexOpacity(theme.palette.neutral_500, '40'),
          },
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
    borderWidth: 1,
  },
});
