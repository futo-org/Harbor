// Fetches CI secrets from the Infisical project `harbor`, by name. Needs
// `enable-openid-connect: true` on the workflow and a runner on the NetBird
// mesh. No dependencies: it runs in every job image.
const fs = require('node:fs');
const crypto = require('node:crypto');

const url = 'https://infisical.futo.network';
const input = (name) =>
  (process.env[`INPUT_${name.toUpperCase()}`] || '')
    .split(/\s+/)
    .filter(Boolean);

async function login(identity) {
  const {
    ACTIONS_ID_TOKEN_REQUEST_URL: tokenUrl,
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: tokenAuth,
  } = process.env;
  if (!tokenUrl) return null;

  const oidc = await fetch(`${tokenUrl}&audience=${encodeURIComponent(url)}`, {
    headers: { authorization: `bearer ${tokenAuth}` },
  });
  if (!oidc.ok) throw new Error(`OIDC token: ${oidc.status}`);

  const session = await fetch(`${url}/api/v1/auth/oidc-auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identityId: identity,
      jwt: (await oidc.json()).value,
    }),
  });
  if (!session.ok) {
    throw new Error(
      `Infisical login: ${session.status} ${await session.text()}`,
    );
  }
  return (await session.json()).accessToken;
}

// The first folder that has the secret wins: the environment's, the repo's,
// then the org's.
async function fetchSecret(token, name, folders) {
  for (const [environment, secretPath] of folders) {
    const query = new URLSearchParams({
      workspaceSlug: 'harbor',
      environment,
      secretPath,
    });
    const response = await fetch(`${url}/api/v3/secrets/raw/${name}?${query}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.ok) return (await response.json()).secret.secretValue;
    if (response.status !== 404) {
      throw new Error(`${name}: ${response.status} ${await response.text()}`);
    }
  }
  throw new Error(`${name} is not in Infisical`);
}

async function main() {
  const { INFISICAL_IDENTITY, INFISICAL_ENVIRONMENT, GITHUB_OUTPUT } =
    process.env;
  const identity = input('identity')[0] || INFISICAL_IDENTITY;
  const environment = input('environment')[0] || INFISICAL_ENVIRONMENT;
  const names = input('secrets');

  const token = await login(identity);
  if (!token) {
    // Fork pull requests get no OIDC token, as they got no secrets before.
    console.log(
      '::warning::no OIDC token for this job; continuing without secrets',
    );
    return;
  }

  const folders = [
    ['global', '/ci/harbor'],
    ['global', '/ci/org'],
  ];
  if (environment) folders.unshift([environment, '/ci/harbor']);

  for (const name of names) {
    const value = await fetchSecret(token, name, folders);
    for (const line of value.split('\n')) {
      if (line.trim())
        console.log(
          `::add-mask::${line.replaceAll('%', '%25').replaceAll('\r', '%0D')}`,
        );
    }
    const delimiter = `EOF_${crypto.randomUUID()}`;
    fs.appendFileSync(
      GITHUB_OUTPUT,
      `${name}<<${delimiter}\n${value}\n${delimiter}\n`,
    );
  }
  console.log(`fetched ${names.join(', ')}`);
}

main().catch((error) => {
  console.log(`::error::${error.message}`);
  process.exit(1);
});
