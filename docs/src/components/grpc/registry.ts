import {
  createFileRegistry,
  type FileRegistry,
  fromJson,
  type JsonValue,
} from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';
import { model } from './api';

let registry: FileRegistry | undefined;

/** Runtime descriptors for encoding requests and decoding responses. */
export function getRegistry(): FileRegistry {
  if (!registry) {
    registry = createFileRegistry(
      fromJson(FileDescriptorSetSchema, model.descriptorSet as JsonValue, {
        ignoreUnknownFields: true,
      }),
    );
  }
  return registry;
}
