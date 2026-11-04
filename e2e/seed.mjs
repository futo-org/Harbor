#!/usr/bin/env node
// Seeds the named identities the e2e flows search for ("Request verification"
// finds users by profile name on the server). Idempotent: each private key is
// derived from a fixed string, and the identity key is a hash of the identity
// document, so every machine and CI job lands on the same two identities;
// nothing is written when the server already has them.
// These are throwaway test users, so the keys being public is fine.
import { createHash } from 'node:crypto';
import { COLLECTION } from '@polycentric/js-core';
import { createNodeClient } from '@polycentric/js-core/node';
import {
  ContentBody,
  identityKeyForSeed,
  Post,
  ProfileUpdate,
} from '@polycentric/rs-core-wasm';

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

// The seed state's private keys are sealed under this; the users are
// throwaway, so a fixed key is fine.
const WRAPPING_KEY = process.env.E2E_WRAPPING_KEY ?? 'e2e0'.repeat(16);

const sha256 = (data) => createHash('sha256').update(data).digest();

/** A seeded user's fixed key (32 bytes). */
export function seedFor(name) {
  const seed = sha256(`harbor-e2e:${name}`);
  return seed.buffer.slice(seed.byteOffset, seed.byteOffset + seed.length);
}

/** A seeded user's identity: a function of its key and the servers. */
export function identityFor(client, name) {
  return identityKeyForSeed(seedFor(name), client.servers);
}

const publish = (client, contentBody, collection) =>
  client.publish({ contentBody }, collection);

async function ensureUser(client, name) {
  const identityKey = identityFor(client, name);

  // Ask the server rather than local state: a fresh checkout has none, and
  // claiming the identity would publish a login event on every run.
  const profiles = await client.listEvents({
    identity: identityKey,
    collection: COLLECTION.PROFILE,
  });
  if (profiles.length > 0) {
    console.log(`${name}: ${identityKey} (exists)`);
    return;
  }

  // A run that failed partway through will already have the login.
  const [existing] = await client.listLogins(identityKey);
  if (existing) await client.loginAs(existing.id, false);
  else await client.createIdentityFromSeed(seedFor(name));

  await publish(
    client,
    new ContentBody.ProfileUpdate({
      profileUpdate: ProfileUpdate.create({
        name,
        description: 'Seeded for e2e tests',
      }),
    }),
    COLLECTION.PROFILE,
  );
  // A fresh server (CI's) has no posts, and the Explore flows scroll past a
  // screen of them.
  for (let i = 1; i <= POSTS_PER_SEEDED_USER; i++) {
    await publish(
      client,
      new ContentBody.Post({
        post: Post.create({ text: `Seeded post ${i} by ${name}` }),
      }),
      COLLECTION.FEED,
    );
  }
  await client.sync();
  console.log(`${name}: ${client.activeIdentityKey}`);
}

// Returns the client, which verify.mjs reuses to act as the seeded users.
export async function seed() {
  const client = await createNodeClient({
    databasePath: `${STATE_DIR}seed.db`,
    wrappingKey: WRAPPING_KEY,
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
