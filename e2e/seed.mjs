#!/usr/bin/env node
// Seeds the named identities the e2e flows search for ("Request verification"
// finds users by profile name on the server). Idempotent: each private key is
// derived from a fixed string, and the identity key is a hash of the identity
// document, so every machine and CI job lands on the same two identities;
// nothing is written when the server already has them.
// These are throwaway test users, so the keys being public is fine.
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { COLLECTION, KEY_TYPE, v2 } from '@polycentric/js-core';
import { createPolycentricNodeClient } from '@polycentric/js-node';

// Passed to the flows as -e variables. Avoid English stop words in names: the
// server's full-text search would drop "A" and match both users.
export const SEEDED_USERS = {
  MAESTRO_VERIFIER_A: 'Maestro Verifier Alpha',
  MAESTRO_VERIFIER_B: 'Maestro Verifier Bravo',
};

const POSTS_PER_SEEDED_USER = 15;

// The server the app under test talks to.
const SERVER_URL = process.env.E2E_SERVER_URL ?? 'http://localhost:3000';
const STATE_DIR = new URL('.seed/', import.meta.url).pathname;

const sha256 = (data) =>
  new Uint8Array(createHash('sha256').update(data).digest());

// The signup info (login, key pair, genesis event) of a seeded user. The
// identity key only depends on the key pair and the client's servers, so it
// is the same whether or not the identity exists yet.
export async function signupInfoFor(client, name) {
  const keyType = KEY_TYPE.ED25519;
  const privateKey = v2.PrivateKey.create({
    keyType,
    key: sha256(`harbor-e2e:${name}`),
  });
  const publicKey = v2.PublicKey.create({
    keyType,
    key: await client.crypto.derivePublicKey(privateKey.key, keyType),
  });
  return client.loginManager.deriveSignupInfo({
    keyType,
    privateKey,
    publicKey,
  });
}

async function ensureUser(client, name) {
  const info = await signupInfoFor(client, name);
  const { identity: identityKey, publicKey } = info.login;

  // Ask the server rather than local state: a fresh checkout has none, and
  // adopting the identity via loginManager.claim would publish a login
  // event on every run.
  const profiles = await client.listEvents({
    identity: identityKey,
    collection: COLLECTION.PROFILE,
  });
  if (profiles.length > 0) {
    console.log(`${name}: ${identityKey} (exists)`);
    return;
  }

  // The login is stored before anything else is persisted. A run that failed
  // partway through will already have it.
  const stored = await client.storage.logins.getLoginDetails(
    identityKey,
    publicKey,
  );
  if (!stored) {
    await client.storage.logins.putLogin(
      identityKey,
      info.keyPair,
      'pendingSignup',
    );
  }
  await client.contentManager.save(info.identityContent);
  await client.commitEvent(info.genesisEvent, info.identityContent);
  await client.loginManager.finishSignup(info.login);
  await client.loginAs(info.login);
  const content = client.contentManager.build({
    oneofKind: 'profileUpdate',
    profileUpdate: { name, description: 'Seeded for e2e tests' },
  });
  await client.contentManager.save(content);
  const event = await client.buildEvent(content, COLLECTION.PROFILE);
  await client.commitEvent(await client.signEvent(event), content);
  // A fresh server (CI's) has no posts, and the Explore flows scroll past a
  // screen of them.
  for (let i = 1; i <= POSTS_PER_SEEDED_USER; i++) {
    const postContent = client.contentManager.build({
      oneofKind: 'post',
      post: v2.Post.create({ text: `Seeded post ${i} by ${name}` }),
    });
    await client.contentManager.save(postContent);
    const postEvent = await client.buildEvent(postContent);
    await client.commitEvent(await client.signEvent(postEvent), postContent);
  }
  await client.sync();
  console.log(`${name}: ${client.activeIdentityKey}`);
}

// Returns the client, which verify.mjs reuses to act as the seeded users.
export async function seed() {
  mkdirSync(`${STATE_DIR}blobs`, { recursive: true });
  const client = await createPolycentricNodeClient({
    databasePath: `${STATE_DIR}seed.db`,
    blobDirectory: `${STATE_DIR}blobs`,
    seedServers: [SERVER_URL],
  });
  for (const name of Object.values(SEEDED_USERS))
    await ensureUser(client, name);
  return client;
}

if (import.meta.main) {
  await seed();
  process.exit(0);
}
