import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Decode `uri` (including HEIC/HEIF, which the Rust core can't read) and
 * re-encode it as an upright JPEG, returning a new file/blob URI.
 */
export async function normalizeImage(uri: string): Promise<string> {
  const rendered = await ImageManipulator.manipulate(uri).renderAsync();
  const result = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 1,
  });
  return result.uri;
}
