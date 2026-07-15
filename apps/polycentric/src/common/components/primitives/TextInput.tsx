import {
  TextInput as RNTextInput,
  type TextInputProps as RNTextInputProps,
  type TextStyle,
  StyleSheet,
  Platform,
} from 'react-native';
import { forwardRef, useState } from 'react';
import {
  useTheme,
  withHexOpacity,
  typography,
  BorderRadius,
  type PaletteColorToken,
} from '@/src/common/theme';
import { BlurView } from 'expo-blur';

export interface TextInputProps
  extends Omit<RNTextInputProps, 'placeholderTextColor'> {
  variant?: 'default' | 'plain';
  placeholderTextColor?: PaletteColorToken;
  disabled?: boolean;
  error?: boolean;
}

export const TextInput = forwardRef<RNTextInput, TextInputProps>(
  (
    {
      numberOfLines,
      multiline,
      style,
      placeholderTextColor,
      variant = 'default',
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

    const baseStyle: TextStyle = {
      paddingVertical: 12,
      paddingHorizontal: 12,
      fontSize: typography.fontSize.md,
      color: disabled ? theme.palette.neutral_500 : theme.palette.neutral_1000,
      opacity: disabled ? 0.5 : 1,
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
            minHeight: numberOfLines * typography.lineHeight.md,
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
            borderRadius: BorderRadius.md,
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
