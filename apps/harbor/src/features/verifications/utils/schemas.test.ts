jest.mock('@polycentric/react-native', () =>
  jest.requireActual('@/test/polycentric'),
);

import { v2 } from '@polycentric/react-native';
import {
  decodeFieldValue,
  encodeFieldValue,
  formToSchema,
  serializeSchema,
} from './schemas';

describe('serializeSchema', () => {
  it('carries the schema and leaves the digest to rs-core', () => {
    const schema = formToSchema({ name: 'X', fields: [] });
    const serialized = serializeSchema(schema);
    expect(serialized.schema).toBe(schema);
    expect(serialized.digest).toBeUndefined();
  });
});

describe('field values', () => {
  it('round-trips string fields', () => {
    const bytes = encodeFieldValue(v2.FieldKind.String, 'héllo');
    expect(bytes).toBeInstanceOf(ArrayBuffer);
    expect(decodeFieldValue(v2.FieldKind.String, bytes)).toBe('héllo');
  });

  it('rejects other kinds', () => {
    expect(() => encodeFieldValue(v2.FieldKind.Int, '1')).toThrow(
      'Unsupported field kind: Int',
    );
  });
});
