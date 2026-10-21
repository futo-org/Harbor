// Model of the gRPC API reference, built from the proto files by the plugin
// in ./index.ts and rendered by src/components/grpc.

export type ScalarName =
  | 'double'
  | 'float'
  | 'int64'
  | 'uint64'
  | 'int32'
  | 'fixed64'
  | 'fixed32'
  | 'bool'
  | 'string'
  | 'bytes'
  | 'uint32'
  | 'sfixed32'
  | 'sfixed64'
  | 'sint32'
  | 'sint64';

export type TypeRef =
  | { kind: 'scalar'; scalar: ScalarName }
  | { kind: 'message'; typeName: string }
  | { kind: 'enum'; typeName: string };

export type Cardinality = 'single' | 'optional' | 'repeated' | 'map';

export type ApiField = {
  name: string;
  jsonName: string;
  number: number;
  comment: string;
  /** Element type for repeated fields, value type for maps. */
  type: TypeRef;
  cardinality: Cardinality;
  /** Key type of a map field. */
  mapKey?: ScalarName;
  /** Name of the oneof group the field belongs to. */
  oneof?: string;
};

export type ApiMessage = {
  /** Name without the package, e.g. `Content` or `Outer.Inner`. */
  name: string;
  /** Fully qualified name, e.g. `polycentric.v2.Content`. */
  typeName: string;
  file: string;
  comment: string;
  fields: ApiField[];
};

export type ApiEnumValue = {
  name: string;
  number: number;
  comment: string;
};

export type ApiEnum = {
  name: string;
  typeName: string;
  file: string;
  comment: string;
  values: ApiEnumValue[];
};

export type ApiMethod = {
  name: string;
  comment: string;
  /** Fully qualified request type name. */
  input: string;
  /** Fully qualified response type name. */
  output: string;
  clientStreaming: boolean;
  serverStreaming: boolean;
};

export type ApiService = {
  name: string;
  typeName: string;
  file: string;
  comment: string;
  methods: ApiMethod[];
};

export type ApiFile = {
  /** Path relative to the proto root, e.g. `polycentric/v2/events.proto`. */
  name: string;
  /** Fully qualified names in declaration order. */
  messages: string[];
  enums: string[];
  services: string[];
};

export type ApiModel = {
  package: string;
  /** Sorted by file name. */
  files: ApiFile[];
  /** Sorted by service name. */
  services: ApiService[];
  messages: Record<string, ApiMessage>;
  enums: Record<string, ApiEnum>;
  /**
   * The same files as a google.protobuf.FileDescriptorSet in proto JSON form,
   * without source info. The Try it panels build a runtime registry from it
   * to encode requests and decode responses.
   */
  descriptorSet: unknown;
};
