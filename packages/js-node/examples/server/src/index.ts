import { v2 } from '@polycentric/js-core';
import { createPolycentricNodeClient } from '@polycentric/js-node';
import ejs from 'ejs';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import path from 'node:path';

const DB_PATH = path.resolve(process.cwd(), 'polycentric.db');
const PORT = 3001;
const VIEWS = path.resolve(import.meta.dirname, '../views');
const SEED_SERVERS = (
  process.env.POLYCENTRIC_SEED_SERVERS ?? 'http://localhost:3000'
)
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const client = await createPolycentricNodeClient({
  databasePath: DB_PATH,
  seedServers: SEED_SERVERS,
});

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

interface PostRow {
  signaturePrefix: string;
  identityKey: string;
  signerHex: string;
  createdAt: string;
  text: string;
}

async function loadFeed(): Promise<PostRow[]> {
  let bundles: v2.EventBundle[] = [];
  try {
    bundles = await client.listEvents({ collection: 2 });
  } catch {
    return [];
  }
  const posts: PostRow[] = [];
  for (const bundle of bundles) {
    if (!bundle.signedEvent || !bundle.serializedContent?.contentBytes)
      continue;
    try {
      const event = v2.Event.fromBinary(bundle.signedEvent.eventBytes);
      const content = v2.Content.fromBinary(
        bundle.serializedContent.contentBytes,
      );
      if (content.contentBody.oneofKind !== 'post') continue;
      posts.push({
        signaturePrefix: toHex(bundle.signedEvent.signature.slice(0, 8)),
        identityKey: event.key?.identity ?? '',
        signerHex: event.key?.signedBy?.key
          ? toHex(event.key.signedBy.key)
          : '',
        createdAt: new Date(Number(event.createdAt)).toISOString(),
        text: content.contentBody.post.text,
      });
    } catch {
      // skip malformed
    }
  }
  posts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return posts;
}

async function renderIndex() {
  const publicKeyHex = client.currentKeyPair
    ? toHex(client.currentKeyPair.publicKey.key)
    : '';
  const posts = await loadFeed();
  return ejs.renderFile(path.join(VIEWS, 'index.ejs'), {
    publicKeyHex,
    activeIdentityKey: client.activeIdentityKey,
    servers: client.servers,
    posts,
  });
}

async function readBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf-8'));
}

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void> | void;

const routes: Record<string, Handler> = {
  'GET /': async (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(await renderIndex());
  },

  'POST /identity': async (_req, res) => {
    if (!client.currentKeyPair) {
      res.statusCode = 400;
      res.end('no key pair');
      return;
    }
    if (client.activeIdentityKey) {
      res.statusCode = 303;
      res.setHeader('Location', '/');
      res.end();
      return;
    }
    await client.identityManager.publish(
      null,
      [client.currentKeyPair.publicKey],
      [],
    );
    res.statusCode = 303;
    res.setHeader('Location', '/');
    res.end();
  },

  'POST /post': async (req, res) => {
    if (!client.activeIdentityKey) {
      res.statusCode = 400;
      res.end('create an identity first');
      return;
    }
    const body = await readBody(req);
    const text = (body.get('text') ?? '').trim();
    if (!text) {
      res.statusCode = 303;
      res.setHeader('Location', '/');
      res.end();
      return;
    }
    const content = await client.contentManager.build({
      oneofKind: 'post',
      post: { text, images: [] },
    });
    await client.contentManager.save(content);
    const event = await client.buildEvent(content);
    const signedEvent = await client.signEvent(event);
    await client.commitEvent(signedEvent, content);
    await client.sync();
    res.statusCode = 303;
    res.setHeader('Location', '/');
    res.end();
  },

  'POST /sync': async (_req, res) => {
    try {
      await client.sync();
    } catch (err) {
      console.error('sync failed:', err);
    }
    res.statusCode = 303;
    res.setHeader('Location', '/');
    res.end();
  },
};

const server = createServer(async (req, res) => {
  const handler = routes[`${req.method} ${req.url}`];
  if (!handler) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  try {
    await handler(req, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end(String(err));
  }
});

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  console.log(`servers: ${SEED_SERVERS.join(', ')}`);
});
