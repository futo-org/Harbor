const LATEST_RELEASE_URL =
  'https://gitlab.futo.org/api/v4/projects/42/releases/permalink/latest';

export interface LatestRelease {
  tagName: string;
}

export async function fetchLatestRelease(): Promise<LatestRelease> {
  const response = await fetch(LATEST_RELEASE_URL, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(
      `Latest release request failed with status ${response.status}`,
    );
  }

  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('tag_name' in body) ||
    typeof body.tag_name !== 'string'
  ) {
    throw new Error('Latest release response is missing tag_name');
  }

  return { tagName: body.tag_name };
}
