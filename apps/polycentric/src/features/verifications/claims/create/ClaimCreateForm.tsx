import { Text, TextInput } from '@/src/common/components';
import { Atoms, useTheme } from '@/src/common/theme';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import type { ClaimType, FormField } from '../../utils/forms';
import useCreateClaim, { type ClaimRef } from '../../hooks/useCreateClaim';
import { formToSchema } from '../../utils/schemas';

// Submission is driven from outside (the sheet header's Create button), so
// the form reports its current state upward instead of rendering a button.
export type ClaimFormState = {
  submit: () => void;
  isValid: boolean;
  isPending: boolean;
};

// Renders the input form for a claim type, collects values, and publishes the
// claim. `onSubmitted` fires once the claim is created. Remount (via a `key`
// on the claim type) to reset between types.
export function ClaimCreateForm({
  claimType,
  onSubmitted,
  onFormState,
}: {
  claimType: ClaimType;
  onSubmitted: (ref: ClaimRef) => void;
  onFormState: (state: ClaimFormState | null) => void;
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

  // `onSubmit` closes over hook values that change identity every render, so
  // hand the parent a stable wrapper around a ref and only re-report when the
  // state the header button renders from changes — reporting on every render
  // would loop: report -> parent setState -> re-render -> report.
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  });

  useEffect(() => {
    onFormState({
      submit: () => void onSubmitRef.current(),
      isValid,
      isPending,
    });
    return () => onFormState(null);
  }, [onFormState, isValid, isPending]);

  return (
    <View style={Atoms.gap_md}>
      {claimType.fields.map((field, i) => (
        <FieldInput
          key={field.key}
          field={field}
          value={values[field.key] ?? ''}
          autoFocus={i === 0}
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
    </View>
  );
}

function FieldInput({
  field,
  value,
  autoFocus,
  onChange,
}: {
  field: FormField;
  value: string;
  autoFocus?: boolean;
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
        autoFocus={autoFocus}
        placeholder={isDate ? 'YYYY-MM-DD' : field.label}
        autoCapitalize={isDate ? 'none' : 'sentences'}
        multiline={multiline}
        numberOfLines={multiline ? 4 : undefined}
      />
    </View>
  );
}
