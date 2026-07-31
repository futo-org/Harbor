import { type ViewStyle, View } from 'react-native';
import { forwardRef } from 'react';
import { Text } from '@/src/common/components/primitives';
import {
  TextInput,
  type TextInputProps,
} from '@/src/common/components/primitives';
import {
  Spacing,
  type SpacingToken,
  type PaletteColorToken,
} from '@/src/common/theme';
import type { TextInput as RNTextInput } from 'react-native';

interface FormFieldProps extends TextInputProps {
  label?: string;
  labelColor?: PaletteColorToken;
  labelMarginBottom?: SpacingToken;
  containerStyle?: ViewStyle;
}

export const FormField = forwardRef<RNTextInput, FormFieldProps>(
  (
    { label, labelColor, labelMarginBottom = 'sm', containerStyle, ...props },
    ref,
  ) => {
    return (
      <View style={containerStyle}>
        {label && (
          <View style={{ marginBottom: Spacing[labelMarginBottom] }}>
            <Text variant="secondary" color={labelColor ?? 'neutral_500'}>
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
