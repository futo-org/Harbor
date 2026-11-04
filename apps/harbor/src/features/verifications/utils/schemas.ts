import { v2 } from '@polycentric/react-native';
import { asBuffer } from '@/src/common/lib/polycentric-hooks/helpers';

/**
 * Derive the verification schema from a claim's form fields.
 */
export function formToSchema(form: {
  name: string;
  fields: { key: string; label: string; required?: boolean }[];
}): v2.VerificationSchema {
  return {
    name: form.name,
    description: '',
    fields: form.fields.map((f) =>
      v2.FieldDef.create({
        key: f.key,
        kind: v2.FieldKind.String,
        format: '',
        required: !!f.required,
        description: f.label,
      }),
    ),
  };
}

/**
 * The schema as a `VerificationClaim` carries it. rs-core encodes it and
 * derives the digest over those bytes when it publishes the claim.
 */
export function serializeSchema(
  schema: v2.VerificationSchema,
): v2.SerializedVerificationSchema {
  return { schema, digest: undefined };
}

/** Encode a field value to its canonical bytes for the given kind. */
export function encodeFieldValue(
  kind: v2.FieldKind,
  value: string,
): ArrayBuffer {
  switch (kind) {
    case v2.FieldKind.String:
      return asBuffer(new TextEncoder().encode(value));
    default:
      // Only String fields exist today. Other kinds (Int/Bool/Bytes) need
      // their own canonical encoders before use.
      throw new Error(`Unsupported field kind: ${v2.FieldKind[kind]}`);
  }
}

/** Decode a field's canonical bytes back to a display string. */
export function decodeFieldValue(
  kind: v2.FieldKind,
  bytes: ArrayBuffer | Uint8Array,
): string {
  switch (kind) {
    case v2.FieldKind.String:
      return new TextDecoder().decode(bytes);
    default:
      throw new Error(`Unsupported field kind: ${v2.FieldKind[kind]}`);
  }
}
