// Exports CI secrets from the Infisical project `harbor` to the job's
// environment. Needs `enable-openid-connect: true` on the workflow and a
// runner on the NetBird mesh. No dependencies: it runs in every job image.
const fs = require('node:fs');
const crypto = require('node:crypto');

const url = 'https://infisical.futo.network';
const input = (name) =>
  (process.env[`INPUT_${name.toUpperCase()}`] || '').trim();

async function request(what, target, options) {
  const response = await fetch(target, options);
  if (!response.ok)
    throw new Error(`${what}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function login(identity) {
  const {
    ACTIONS_ID_TOKEN_REQUEST_URL: tokenUrl,
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: tokenAuth,
  } = process.env;
  if (!tokenUrl) return null;
  const oidc = await request(
    'OIDC token',
    `${tokenUrl}&audience=${encodeURIComponent(url)}`,
    {
      headers: { authorization: `bearer ${tokenAuth}` },
    },
  );
  const session = await request(
    'Infisical login',
    `${url}/api/v1/auth/oidc-auth/login`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identityId: identity, jwt: oidc.value }),
    },
  );
  return session.accessToken;
}

async function list(token, environment, path) {
  const query = new URLSearchParams({
    workspaceSlug: 'harbor',
    environment,
    secretPath: path,
  });
  const { secrets } = await request(
    `${environment}:${path}`,
    `${url}/api/v3/secrets/raw?${query}`,
    {
      headers: { authorization: `Bearer ${token}` },
    },
  );
  return Object.fromEntries(
    secrets.map((secret) => [secret.secretKey, secret.secretValue]),
  );
}

async function main() {
  const names = input('secrets').split(/\s+/).filter(Boolean);
  const environment = input('environment');
  const token = await login(input('identity'));
  if (!token) {
    // Fork pull requests get no OIDC token, as they got no secrets before.
    console.log(
      '::warning::no OIDC token for this job; continuing without secrets',
    );
    return;
  }

  // Later folders win: the org's, the repo's, then the environment's.
  const folders = [
    ['global', '/ci/org'],
    ['global', '/ci/harbor'],
  ];
  if (environment) folders.push([environment, '/ci/harbor']);
  const secrets = {};
  for (const [env, path] of folders)
    Object.assign(secrets, await list(token, env, path));

  const missing = names.filter((name) => !secrets[name]);
  if (missing.length)
    throw new Error(`not in Infisical: ${missing.join(', ')}`);

  const { GITHUB_ENV: envFile } = process.env;
  for (const name of names) {
    const value = secrets[name];
    for (const line of value.split('\n'))
      if (line.trim())
        console.log(
          `::add-mask::${line.replaceAll('%', '%25').replaceAll('\r', '%0D')}`,
        );
    const delimiter = `EOF_${crypto.randomUUID()}`;
    fs.appendFileSync(
      envFile,
      `${name}<<${delimiter}\n${value}\n${delimiter}\n`,
    );
  }
  console.log(`exported ${names.join(', ')}`);
}

main().catch((error) => {
  console.log(`::error::${error.message}`);
  process.exit(1);
});
