export function base64ToImageSource(
  base64: string,
  mimeType: string = 'image/png',
) {
  return { uri: `data:${mimeType};base64,${base64}` };
}
