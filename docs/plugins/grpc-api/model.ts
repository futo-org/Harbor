import type {
  ApiEnum,
  ApiField,
  ApiFile,
  ApiModel,
  Cardinality,
  ScalarName,
  TypeRef,
} from './types';

// The subset of google.protobuf.FileDescriptorSet, in proto JSON form, that
// `buf build -o -#format=json` emits and this module reads.

type Location = {
  path?: number[];
  leadingComments?: string;
  trailingComments?: string;
};

type FieldProto = {
  name: string;
  number?: number;
  label?: 'LABEL_OPTIONAL' | 'LABEL_REQUIRED' | 'LABEL_REPEATED';
  type?: string;
  typeName?: string;
  jsonName?: string;
  oneofIndex?: number;
  proto3Optional?: boolean;
};

type EnumProto = {
  name: string;
  value?: { name: string; number?: number }[];
};

type MessageProto = {
  name: string;
  field?: FieldProto[];
  nestedType?: MessageProto[];
  enumType?: EnumProto[];
  oneofDecl?: { name: string }[];
  options?: { mapEntry?: boolean };
};

type MethodProto = {
  name: string;
  inputType: string;
  outputType: string;
  clientStreaming?: boolean;
  serverStreaming?: boolean;
};

type ServiceProto = {
  name: string;
  method?: MethodProto[];
};

export type FileProto = {
  name: string;
  package?: string;
  messageType?: MessageProto[];
  enumType?: EnumProto[];
  service?: ServiceProto[];
  sourceCodeInfo?: { location?: Location[] };
  bufExtension?: unknown;
};

export type ImageJson = { file: FileProto[] };

const SCALARS: Record<string, ScalarName> = {
  TYPE_DOUBLE: 'double',
  TYPE_FLOAT: 'float',
  TYPE_INT64: 'int64',
  TYPE_UINT64: 'uint64',
  TYPE_INT32: 'int32',
  TYPE_FIXED64: 'fixed64',
  TYPE_FIXED32: 'fixed32',
  TYPE_BOOL: 'bool',
  TYPE_STRING: 'string',
  TYPE_BYTES: 'bytes',
  TYPE_UINT32: 'uint32',
  TYPE_SFIXED32: 'sfixed32',
  TYPE_SFIXED64: 'sfixed64',
  TYPE_SINT32: 'sint32',
  TYPE_SINT64: 'sint64',
};

/**
 * Strips the comment syntax protoc leaves in `leading_comments`: the space
 * after `//`, the `*` prefixes of block comments and the extra `/` of `///`.
 */
export function cleanComment(raw: string | undefined): string {
  if (!raw) return '';
  const lines = raw
    .split('\n')
    .map((line) => line.replace(/^ ?[*/]* ?/, '').trimEnd());
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

/** Comments of one file, looked up by descriptor path. */
class Comments {
  private readonly byPath = new Map<string, Location>();

  constructor(file: FileProto) {
    for (const location of file.sourceCodeInfo?.location ?? []) {
      this.byPath.set((location.path ?? []).join('.'), location);
    }
  }

  at(path: number[]): string {
    const location = this.byPath.get(path.join('.'));
    return (
      cleanComment(location?.leadingComments) ||
      cleanComment(location?.trailingComments)
    );
  }
}

type Context = {
  model: ApiModel;
  comments: Comments;
  file: ApiFile;
  pkg: string;
};

function stripDot(typeName: string): string {
  return typeName.replace(/^\./, '');
}

function typeRef(field: FieldProto): TypeRef {
  if (field.type === 'TYPE_MESSAGE') {
    return { kind: 'message', typeName: stripDot(field.typeName ?? '') };
  }
  if (field.type === 'TYPE_ENUM') {
    return { kind: 'enum', typeName: stripDot(field.typeName ?? '') };
  }
  const scalar = SCALARS[field.type ?? ''];
  if (!scalar) {
    throw new Error(`Unsupported type ${field.type} on field ${field.name}`);
  }
  return { kind: 'scalar', scalar };
}

function toField(
  ctx: Context,
  message: MessageProto,
  mapEntries: Map<string, MessageProto>,
  field: FieldProto,
  path: number[],
): ApiField {
  let type = typeRef(field);
  let cardinality: Cardinality = 'single';
  let mapKey: ScalarName | undefined;

  if (field.label === 'LABEL_REPEATED') {
    const entry =
      type.kind === 'message' ? mapEntries.get(type.typeName) : undefined;
    const [key, value] = entry?.field ?? [];
    if (key && value) {
      cardinality = 'map';
      const keyType = typeRef(key);
      mapKey = keyType.kind === 'scalar' ? keyType.scalar : 'string';
      type = typeRef(value);
    } else {
      cardinality = 'repeated';
    }
  } else if (field.proto3Optional) {
    cardinality = 'optional';
  }

  const oneof =
    field.oneofIndex !== undefined && !field.proto3Optional
      ? message.oneofDecl?.[field.oneofIndex]?.name
      : undefined;

  return {
    name: field.name,
    jsonName: field.jsonName ?? field.name,
    number: field.number ?? 0,
    comment: ctx.comments.at(path),
    type,
    cardinality,
    ...(mapKey ? { mapKey } : {}),
    ...(oneof ? { oneof } : {}),
  };
}

function walkEnum(
  ctx: Context,
  enumProto: EnumProto,
  path: number[],
  parent: string,
): void {
  const typeName = `${parent}.${enumProto.name}`;
  const api: ApiEnum = {
    name: typeName.slice(ctx.pkg.length + 1),
    typeName,
    file: ctx.file.name,
    comment: ctx.comments.at(path),
    values: (enumProto.value ?? []).map((value, i) => ({
      name: value.name,
      number: value.number ?? 0,
      comment: ctx.comments.at([...path, 2, i]),
    })),
  };
  ctx.model.enums[typeName] = api;
  ctx.file.enums.push(typeName);
}

function walkMessage(
  ctx: Context,
  message: MessageProto,
  path: number[],
  parent: string,
): void {
  const typeName = `${parent}.${message.name}`;
  const mapEntries = new Map<string, MessageProto>();
  for (const nested of message.nestedType ?? []) {
    if (nested.options?.mapEntry) {
      mapEntries.set(`${typeName}.${nested.name}`, nested);
    }
  }

  ctx.model.messages[typeName] = {
    name: typeName.slice(ctx.pkg.length + 1),
    typeName,
    file: ctx.file.name,
    comment: ctx.comments.at(path),
    fields: (message.field ?? []).map((field, i) =>
      toField(ctx, message, mapEntries, field, [...path, 2, i]),
    ),
  };
  ctx.file.messages.push(typeName);

  (message.nestedType ?? []).forEach((nested, i) => {
    if (!nested.options?.mapEntry) {
      walkMessage(ctx, nested, [...path, 3, i], typeName);
    }
  });
  (message.enumType ?? []).forEach((nested, i) => {
    walkEnum(ctx, nested, [...path, 4, i], typeName);
  });
}

function walkService(
  ctx: Context,
  service: ServiceProto,
  path: number[],
): void {
  const typeName = `${ctx.pkg}.${service.name}`;
  ctx.model.services.push({
    name: service.name,
    typeName,
    file: ctx.file.name,
    comment: ctx.comments.at(path),
    methods: (service.method ?? []).map((method, i) => ({
      name: method.name,
      comment: ctx.comments.at([...path, 2, i]),
      input: stripDot(method.inputType),
      output: stripDot(method.outputType),
      clientStreaming: method.clientStreaming === true,
      serverStreaming: method.serverStreaming === true,
    })),
  });
  ctx.file.services.push(typeName);
}

/** Builds the reference model for one package out of a buf image. */
export function buildModel(image: ImageJson, pkg: string): ApiModel {
  // The image lists files in dependency order, which the descriptor set
  // keeps; the reference itself is ordered by name.
  const inDependencyOrder = image.file.filter((file) => file.package === pkg);
  if (inDependencyOrder.length === 0) {
    throw new Error(`No .proto files found for package ${pkg}`);
  }
  const files = [...inDependencyOrder].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const model: ApiModel = {
    package: pkg,
    files: [],
    services: [],
    messages: {},
    enums: {},
    descriptorSet: {
      file: inDependencyOrder.map(
        ({ sourceCodeInfo: _s, bufExtension: _b, ...rest }) => rest,
      ),
    },
  };

  for (const file of files) {
    const apiFile: ApiFile = {
      name: file.name,
      messages: [],
      enums: [],
      services: [],
    };
    const ctx: Context = {
      model,
      comments: new Comments(file),
      file: apiFile,
      pkg,
    };
    (file.messageType ?? []).forEach((message, i) => {
      walkMessage(ctx, message, [4, i], pkg);
    });
    (file.enumType ?? []).forEach((enumProto, i) => {
      walkEnum(ctx, enumProto, [5, i], pkg);
    });
    (file.service ?? []).forEach((service, i) => {
      walkService(ctx, service, [6, i]);
    });
    model.files.push(apiFile);
  }
  model.services.sort((a, b) => a.name.localeCompare(b.name));

  const known = (typeName: string) =>
    typeName in model.messages || typeName in model.enums;
  for (const message of Object.values(model.messages)) {
    for (const field of message.fields) {
      if (field.type.kind !== 'scalar' && !known(field.type.typeName)) {
        throw new Error(
          `${message.typeName}.${field.name} refers to unknown type ${field.type.typeName}`,
        );
      }
    }
  }
  for (const service of model.services) {
    for (const method of service.methods) {
      for (const typeName of [method.input, method.output]) {
        if (!(typeName in model.messages)) {
          throw new Error(
            `${service.name}.${method.name} refers to unknown type ${typeName}`,
          );
        }
      }
    }
  }

  return model;
}
