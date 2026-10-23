const env = process.env;
export const registry = env.REGISTRY || 'registry.futo.org/harbor';
const [host, ...path] = registry.split('/');
const base = `https://${host}/v2/${path.join('/')}`;

const accept = [
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

const request = async (route, method = 'GET') => {
  const response = await fetch(`${base}/${route}`, {
    method,
    headers: { accept },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${method} ${route}: ${response.status}`);
  return response;
};

export const digest = async (repo, tag) =>
  (await request(`${repo}/manifests/${tag}`, 'HEAD'))?.headers.get(
    'docker-content-digest',
  );

// The chart's config blob is its Chart.yaml: appVersion is the commit.
export const chartAt = async (name, tag) => {
  const manifest = await (
    await request(`charts/${name}/manifests/${tag}`)
  )?.json();
  if (!manifest) return null;
  const config = await (
    await request(`charts/${name}/blobs/${manifest.config.digest}`)
  ).json();
  return {
    version: config.version,
    commit: config.appVersion,
    built: manifest.annotations?.['org.opencontainers.image.created'] ?? '',
  };
};
