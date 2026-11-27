import type { GenerateMetadataFunction } from 'expo-router/server';
import { APP_DESCRIPTION, toMetadata } from './page';

/** For screens that read the same for everyone. `title` null is the home page */
export function createFixedMetadata(
  path: string,
  title: string | null,
  description = APP_DESCRIPTION,
): GenerateMetadataFunction {
  return () => toMetadata({ title, description, path });
}
