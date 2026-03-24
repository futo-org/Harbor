import {
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  TextStyle,
  StyleSheet,
  Platform,
} from 'react-native';
import { forwardRef, useState } from 'react';
import { useTheme, ColorToken } from '@/theme';
import { BlurView } from 'expo-blur';

export interface TextInputProps extends Omit<
  RNTextInputProps,
  'placeholderTextColor'
> {
  variant?: 'default' | 'plain';
  placeholderTextColor?: ColorToken;
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
    const { theme, isDark } = useTheme();

    const [isFocused, setIsFocused] = useState(false);
    const isPlain = variant === 'plain';

    const baseStyle: TextStyle = {
      paddingVertical: 12,
      paddingHorizontal: 12,
      fontSize: theme.typography.fontSize.md,
      color: disabled ? theme.colors.neutralSurface : theme.colors.text,
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
            minHeight: numberOfLines * theme.typography.lineHeight.md,
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
            ? theme.colors[placeholderTextColor]
            : theme.colors.neutralSurfaceOpacity80
        }
        selectionColor={theme.colors.primary}
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
            borderRadius: theme.borderRadius.md,
            borderColor: error
              ? theme.colors.destructiveOpacity80
              : isFocused
                ? theme.colors.neutralSurfaceOpacity80
                : theme.colors.neutralSurfaceOpacity40,
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
