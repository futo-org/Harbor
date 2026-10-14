import type {
  ApiModel,
  ScalarName,
  TypeRef,
} from '@site/plugins/grpc-api/types';

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

const MAX_DEPTH = 4;

function scalarExample(scalar: ScalarName): Json {
  switch (scalar) {
    case 'string':
    case 'bytes':
      return '';
    case 'bool':
      return false;
    default:
      return 0;
  }
}

function valueExample(
  api: ApiModel,
  type: TypeRef,
  depth: number,
  stack: string[],
): Json {
  switch (type.kind) {
    case 'scalar':
      return scalarExample(type.scalar);
    case 'enum':
      return api.enums[type.typeName]?.values[0]?.name ?? 0;
    case 'message':
      if (depth >= MAX_DEPTH || stack.includes(type.typeName)) return {};
      return messageExample(api, type.typeName, depth + 1, [
        ...stack,
        type.typeName,
      ]);
  }
}

/**
 * A proto3 JSON skeleton of a message: every field with a zero value, one
 * element per list and map, and the first member of each oneof.
 */
export function messageExample(
  api: ApiModel,
  typeName: string,
  depth = 0,
  stack: string[] = [typeName],
): { [key: string]: Json } {
  const out: { [key: string]: Json } = {};
  const message = api.messages[typeName];
  if (!message) return out;
  const oneofs = new Set<string>();
  for (const field of message.fields) {
    if (field.oneof) {
      if (oneofs.has(field.oneof)) continue;
      oneofs.add(field.oneof);
    }
    const value = valueExample(api, field.type, depth, stack);
    switch (field.cardinality) {
      case 'repeated':
        out[field.name] = [value];
        break;
      case 'map':
        out[field.name] = { [field.mapKey === 'string' ? 'key' : '0']: value };
        break;
      default:
        out[field.name] = value;
    }
  }
  return out;
}
