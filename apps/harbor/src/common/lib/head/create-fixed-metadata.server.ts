import type { GenerateMetadataFunction } from 'expo-router/server';
import { type Head, toMetadata } from './index';

/** For screens that read the same for everyone */
export function createFixedMetadata(head: Head): GenerateMetadataFunction {
  return () => toMetadata(head);
}
