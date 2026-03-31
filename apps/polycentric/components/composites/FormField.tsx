import { ViewStyle, View } from 'react-native';
import { forwardRef } from 'react';
import { Text } from '@/components/primitives';
import { TextInput, TextInputProps } from '@/components/primitives';
import { useLegacyTheme, SpacingToken, ColorToken } from '@/legacyTheme';
import type { TextInput as RNTextInput } from 'react-native';

interface FormFieldProps extends TextInputProps {
  label?: string;
  labelColor?: ColorToken;
  labelMarginBottom?: SpacingToken;
  containerStyle?: ViewStyle;
}

export const FormField = forwardRef<RNTextInput, FormFieldProps>(
  (
    { label, labelColor, labelMarginBottom = 'sm', containerStyle, ...props },
    ref,
  ) => {
    const { legacyTheme } = useLegacyTheme();

    return (
      <View style={containerStyle}>
        {label && (
          <View
            style={{ marginBottom: legacyTheme.spacing[labelMarginBottom] }}
          >
            <Text variant="secondary" color={labelColor ?? 'neutralSurface'}>
              {label}
            </Text>
          </View>
        )}
        <TextInput ref={ref} {...props} />
      </View>
    );
  },
);

FormField.displayName = 'FormField';
