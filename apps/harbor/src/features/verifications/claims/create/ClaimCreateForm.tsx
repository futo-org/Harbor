import { Text, TextInput } from '@/src/common/components';
import {
  AttachImageButtons,
  AttachmentGrid,
} from '@/src/common/components/composites';
import {
  type ImageAttachment,
  type ImageAttachmentStatus,
  MAX_ATTACHMENTS,
  useImageAttachments,
} from '@/src/common/lib/images/useImageAttachments';
import { Atoms } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import type { ClaimType, FormField } from '../../utils/forms';
import useCreateClaim, { type ClaimRef } from '../../hooks/useCreateClaim';
import { formToSchema } from '../../utils/schemas';

// The sheet renders the Create button in its header and the image drop
// overlay over its body, so the form reports what they need upward.
export type ClaimFormState = {
  submit: () => void;
  isValid: boolean;
  isPending: boolean;
  hasAttachments: boolean;
  ingestAssets: (
    assets: { uri: string; width: number; height: number }[],
  ) => void;
  remainingAttachmentSlots: number;
  attachDisabled: boolean;
};

// Renders the input form for a claim type, collects values, and publishes the
// claim. `onSubmitted` fires once the claim is created. Remount (via a `key`
// on the claim type) to reset between types.
export function ClaimCreateForm({
  claimType,
  initialValues,
  header,
  alsoRequestFrom,
  onSubmitted,
  onFormState,
}: {
  claimType: ClaimType;
  // Values for the claim type's hidden fields.
  initialValues?: Record<string, string>;
  // Shown above the inputs, e.g. what the claim is about.
  header?: ReactNode;
  // Identities to request verification from once the claim is created.
  alsoRequestFrom?: string[];
  onSubmitted: (ref: ClaimRef) => void;
  onFormState: (state: ClaimFormState | null) => void;
}) {
  const { submit, isPending } = useCreateClaim();
  const [values, setValues] = useState<Record<string, string>>(
    initialValues ?? {},
  );
  const inputs = claimType.fields.filter((field) => !field.hidden);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const addAttachments = useCallback((additions: ImageAttachment[]) => {
    setAttachments((prev) => [...prev, ...additions]);
  }, []);
  const setAttachmentStatus = useCallback(
    (id: string, status: ImageAttachmentStatus) => {
      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a)),
      );
    },
    [],
  );
  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);
  const getAttachments = useCallback(() => attachments, [attachments]);

  const {
    attachDisabled,
    handleAttachImage,
    handleCaptureImage,
    handleRemoveAttachment,
    ingestAssets,
    resolveImageSets,
  } = useImageAttachments({
    getAttachments,
    addAttachments,
    setAttachmentStatus,
    removeAttachment,
    disabled: isPending,
    setError,
  });

  const hasAttachments = attachments.length > 0;

  const isValid = useMemo(
    () =>
      claimType.fields.every(
        (f) => !f.required || (values[f.key]?.trim().length ?? 0) > 0,
      ) &&
      // Wait for every image upload to finish before allowing submit.
      attachments.every((a) => a.status === 'ready'),
    [claimType, values, attachments],
  );

  const onSubmit = async () => {
    if (!isValid || isPending) return;
    setError(null);
    try {
      const images = await resolveImageSets();
      const ref = await submit({
        schema: formToSchema(claimType),
        values,
        images,
        alsoRequestFrom,
      });
      onSubmitted(ref);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // `onSubmit` closes over hook values that change identity every render, so
  // hand the parent a stable wrapper around a ref and only re-report when the
  // state the sheet renders from changes — reporting on every render
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
      hasAttachments,
      ingestAssets,
      remainingAttachmentSlots: MAX_ATTACHMENTS - attachments.length,
      attachDisabled,
    });
    return () => onFormState(null);
  }, [
    onFormState,
    isValid,
    isPending,
    hasAttachments,
    ingestAssets,
    attachments.length,
    attachDisabled,
  ]);

  return (
    <View style={Atoms.gap_md}>
      {header}

      {inputs.map((field, i) => (
        <FieldInput
          key={field.key}
          field={field}
          value={values[field.key] ?? ''}
          autoFocus={i === 0}
          onChange={(text) =>
            setValues((prev) => ({ ...prev, [field.key]: text }))
          }
          disabled={isPending}
        />
      ))}

      {hasAttachments && (
        <AttachmentGrid
          attachments={attachments}
          disabled={isPending}
          onRemoveAttachment={handleRemoveAttachment}
        />
      )}
      <AttachImageButtons
        onAttachImage={() => void handleAttachImage()}
        onCaptureImage={isWeb ? undefined : () => void handleCaptureImage()}
        disabled={attachDisabled}
      />

      {error && (
        <Text variant="body" color="danger">
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
  disabled,
}: {
  field: FormField;
  value: string;
  autoFocus?: boolean;
  onChange: (text: string) => void;
  disabled?: boolean;
}) {
  const multiline = field.kind === 'multiline';
  const isDate = field.kind === 'date';

  return (
    <View style={Atoms.gap_xs}>
      <Text variant="small" color="secondary" fontWeight="semibold">
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
        disabled={disabled}
      />
    </View>
  );
}
