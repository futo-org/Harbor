/** The shared texts, then each shared URL none of the texts already contains. */
export function joinSharedText(texts: string[], urls: string[]): string {
  const trimmedTexts = texts.map((text) => text.trim()).filter(Boolean);

  const missingUrls = urls.filter(
    (url) => !trimmedTexts.some((text) => text.includes(url)),
  );

  return [...trimmedTexts, ...missingUrls].join('\n');
}
