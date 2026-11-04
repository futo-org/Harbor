// Lets a flow act as a seeded user. Maestro's runScript sandbox has no SDK,
// only an http client, so run.mjs serves this in its own process (and it dies
// with it): POST /verify-newest-claim {"name"} does what it says for that user.
import { createServer } from 'node:http';
import { COLLECTION } from '@polycentric/js-core';
import {
  ContentBody,
  KeyType,
  LoginStatus,
  Query,
  QueryData,
  SyncStrategy,
} from '@polycentric/rs-core-wasm';
import { identityFor, SEEDED_USERS, seedFor } from './seed.mjs';

// Sign in as a seeded user without claiming the identity, whose republish
// would add an identity event every run.
async function actAs(client, name) {
  const identity = identityFor(client, name);
  let [login] = await client.listLogins(identity);
  if (!login) {
    await client.importLegacyData({
      events: [],
      contents: [],
      logins: [
        {
          identity,
          keyType: KeyType.Ed25519,
          privateKey: seedFor(name),
          status: LoginStatus.LiveRotationKey,
        },
      ],
    });
    [login] = await client.listLogins(identity);
  }
  // Brings the identity's events into rs-core, which publishing needs.
  await client.listEvents({ identity, collection: COLLECTION.IDENTITY });
  await client.loginAs(login.id, false);
  await client.sync(SyncStrategy.PartialPull);
  return identity;
}

const eventOf = (bundle) => bundle?.signedEvent?.event;

async function verifyNewestClaim(client, name) {
  const identity = await actAs(client, name);
  // A unique key so rs-core asks the server instead of its cache.
  const data = await client.awaitQuery(
    new Query.ListTargetedVerificationClaims({ targetIdentity: identity }),
    { queryKey: ['e2e', String(Date.now())] },
  );
  const claimBundles =
    data && QueryData.TargetedVerificationClaims.instanceOf(data)
      ? data.inner.response.claimBundles
      : [];
  // newest pending claim
  const claim = claimBundles
    .filter(
      (bundle) =>
        !bundle.verifies.some((v) => eventOf(v)?.key?.identity === identity),
    )
    .map((bundle) => eventOf(bundle.claim))
    .filter((event) => event?.key)
    .sort((a, b) => Number(b.createdAt - a.createdAt))[0];
  if (!claim) throw new Error(`No pending claim targets ${name}`);

  // What the app's useVerifyClaim publishes.
  await client.publish(
    {
      contentBody: new ContentBody.VerificationVerify({
        verificationVerify: { claimEventKey: claim.key },
      }),
    },
    COLLECTION.VERIFICATIONS,
  );
  await client.sync(SyncStrategy.PartialPush);
  return claim.key;
}

async function handle(client, req) {
  if (req.method !== 'POST' || req.url !== '/verify-newest-claim') {
    return [404, 'Only POST /verify-newest-claim'];
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  const { name } = JSON.parse(body);
  if (!Object.values(SEEDED_USERS).includes(name)) {
    return [400, `Not a seeded user: ${name}`];
  }
  const key = await verifyNewestClaim(client, name);
  return [200, `${name} verified ${key.identity}/${key.sequence}`];
}

// Resolves to the base URL, passed to the flows as MAESTRO_VERIFY_URL.
export function startVerifyServer(client) {
  const server = createServer(async (req, res) => {
    const [status, message] = await handle(client, req).catch((error) => [
      500,
      String(error?.stack ?? error),
    ]);
    console.log(`verify-newest-claim: ${status} ${message}`);
    res.writeHead(status).end(message);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${server.address().port}`),
    ),
  );
}
