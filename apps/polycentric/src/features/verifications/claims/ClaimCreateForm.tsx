import { Button, Text, TextInput } from '@/src/common/components';
import { Atoms, useTheme } from '@/src/common/theme';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { ClaimType, FormField } from '../utils/forms';
import useCreateClaim, { ClaimRef } from '../hooks/useCreateClaim';
import { formToSchema } from '../utils/schemas';

// Renders the input form for a claim type, collects values, and publishes the
// claim. `onSubmitted` fires once the claim is created. Remount (via a `key`
// on the claim type) to reset between types.
export function ClaimCreateForm({
  claimType,
  onSubmitted,
}: {
  claimType: ClaimType;
  onSubmitted: (ref: ClaimRef) => void;
}) {
  const { theme } = useTheme();
  const { submit, isPending } = useCreateClaim();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const isValid = useMemo(
    () =>
      claimType.fields.every(
        (f) => !f.required || (values[f.key]?.trim().length ?? 0) > 0,
      ),
    [claimType, values],
  );

  const onSubmit = async () => {
    if (!isValid || isPending) return;
    setError(null);
    try {
      const ref = await submit({ schema: formToSchema(claimType), values });
      if (ref) onSubmitted(ref);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={Atoms.gap_md}>
      {claimType.fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={values[field.key] ?? ''}
          onChange={(text) =>
            setValues((prev) => ({ ...prev, [field.key]: text }))
          }
        />
      ))}

      {error && (
        <Text variant="body" style={{ color: theme.palette.negative_600 }}>
          {error}
        </Text>
      )}

      <Button
        title={isPending ? 'Submitting…' : 'Continue'}
        variant="primary"
        onPress={onSubmit}
        disabled={!isValid || isPending}
      />
    </View>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string;
  onChange: (text: string) => void;
}) {
  const { theme } = useTheme();
  const multiline = field.kind === 'multiline';
  const isDate = field.kind === 'date';

  return (
    <View style={Atoms.gap_xs}>
      <Text
        variant="small"
        style={theme.atoms.text_neutral_medium}
        fontWeight="semibold"
      >
        {field.required ? `${field.label} *` : field.label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={isDate ? 'YYYY-MM-DD' : field.label}
        autoCapitalize={isDate ? 'none' : 'sentences'}
        multiline={multiline}
        numberOfLines={multiline ? 4 : undefined}
      />
    </View>
  );
}
