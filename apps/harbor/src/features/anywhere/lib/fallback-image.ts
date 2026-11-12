const RUMBLE_OEMBED = 'https://rumble.com/api/Media/oembed.json';

function hostOf(url: URL): string {
  return url.hostname.replace(/^(www|m|music)\./, '');
}

function youtubeImage(url: URL): string | undefined {
  const host = hostOf(url);
  const id =
    host === 'youtu.be'
      ? url.pathname.slice(1)
      : host === 'youtube.com'
        ? url.pathname === '/watch'
          ? url.searchParams.get('v')
          : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]
        : undefined;
  if (!id || !/^[\w-]+$/.test(id)) return undefined;
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

async function rumbleImage(url: URL): Promise<string | undefined> {
  if (hostOf(url) !== 'rumble.com') return undefined;
  try {
    const response = await fetch(
      `${RUMBLE_OEMBED}?url=${encodeURIComponent(url.href)}`,
    );
    if (!response.ok) return undefined;
    const { thumbnail_url: image } = await response.json();
    return typeof image === 'string' && image ? image : undefined;
  } catch {
    return undefined;
  }
}

/** An image for a page whose link preview came without one. */
export async function fallbackImage(url: string): Promise<string | undefined> {
  if (!URL.canParse(url)) return undefined;
  const parsed = new URL(url);
  return youtubeImage(parsed) ?? (await rumbleImage(parsed));
}
