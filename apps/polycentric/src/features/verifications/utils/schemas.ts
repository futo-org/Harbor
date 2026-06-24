import { sha256 } from '@noble/hashes/sha2.js';
import { v2 } from '@polycentric/react-native';

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
    fields: form.fields.map((f) => ({
      key: f.key,
      kind: v2.FieldKind.STRING,
      format: '',
      required: !!f.required,
      description: f.label,
    })),
  };
}

/**
 * Serialize a schema and pair it with its digest. The digest is over the exact
 * serialized bytes, which is what a `VerificationClaim` carries inline.
 *
 * TODO: protobuf serialization isn't guaranteed canonical, so re-serializing a
 * schema at runtime risks a digest that differs across protobuf-ts versions or
 * field-order edits — which would stop claims for the "same" schema from
 * grouping. Before relying on cross-client grouping, pin each schema's
 * canonical bytes instead of serializing here.
 */
export function serializeSchema(
  schema: v2.VerificationSchema,
): v2.SerializedVerificationSchema {
  const schemaBytes = v2.VerificationSchema.toBinary(
    v2.VerificationSchema.create(schema),
  );

  return {
    schemaBytes,
    digest: {
      type: v2.ContentDigestType.SHA256,
      value: sha256(schemaBytes),
    },
  };
}

/** Encode a field value to its canonical bytes for the given kind. */
export function encodeFieldValue(
  kind: v2.FieldKind,
  value: string,
): Uint8Array {
  switch (kind) {
    case v2.FieldKind.STRING:
      return new TextEncoder().encode(value);
    default:
      // Only STRING fields exist today. Other kinds (INT/BOOL/BYTES) need
      // their own canonical encoders before use.
      throw new Error(`Unsupported field kind: ${kind}`);
  }
}
