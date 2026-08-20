import { v2 } from '@polycentric/js-core';
import { createPolycentricNodeClient } from '@polycentric/js-node';
import ejs from 'ejs';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';

const DB_PATH = path.resolve(process.cwd(), 'polycentric.db');
const BLOB_DIR = path.resolve(process.cwd(), 'polycentric-blobs');
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
  blobDirectory: BLOB_DIR,
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
  imageBlobUrls: string[];
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
      const post = content.contentBody.post;
      // Basic functionality for images in posts.
      const imageBlobUrls: string[] = [];
      for (const set of post.images) {
        const first = set.images[0];
        if (first?.blob?.digest) {
          const url = client.blobUrl(first.blob.digest);
          if (url) imageBlobUrls.push(url);
        }
      }
      posts.push({
        signaturePrefix: toHex(bundle.signedEvent.signature.slice(0, 8)),
        identityKey: event.key?.identity ?? '',
        signerHex: event.key?.signedBy?.key
          ? toHex(event.key.signedBy.key)
          : '',
        createdAt: new Date(Number(event.createdAt)).toISOString(),
        text: post.text,
        imageBlobUrls,
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

async function readFormData(req: IncomingMessage): Promise<FormData> {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) headers.set(k, v.join(','));
    else if (typeof v === 'string') headers.set(k, v);
  }
  const r = new Request('http://localhost/', {
    method: req.method,
    headers,
    body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  return r.formData();
}

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void> | void;

const routes: Array<{ method: string; pattern: RegExp; handler: Handler }> = [];
const route = (method: string, pattern: RegExp, handler: Handler) =>
  routes.push({ method, pattern, handler });

route('GET', /^\/$/, async (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(await renderIndex());
});

route('POST', /^\/identity$/, async (_req, res) => {
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
  await client.identityManager.publish({
    rotationKeys: [client.currentKeyPair.publicKey],
    signingKeys: [],
  });
  res.statusCode = 303;
  res.setHeader('Location', '/');
  res.end();
});

route('POST', /^\/post$/, async (req, res) => {
  if (!client.activeIdentityKey) {
    res.statusCode = 400;
    res.end('create an identity first');
    return;
  }
  const form = await readFormData(req);
  const text = String(form.get('text') ?? '').trim();
  const file = form.get('image');
  const imageSets: v2.ImageSet[] = [];
  if (file instanceof File && file.size > 0) {
    // Basic functionality for images in posts.
    const raw = new Uint8Array(await file.arrayBuffer());
    const { bytes, width, height } = client.processImageToJpeg(
      raw,
      800,
      800,
      'fit',
    );
    const blob = await client.commitBlob(bytes, 'image/jpeg');
    await client.uploadBlob(blob, bytes);
    imageSets.push(
      v2.ImageSet.create({
        images: [v2.Image.create({ blob, width, height })],
      }),
    );
  }
  if (!text && imageSets.length === 0) {
    res.statusCode = 303;
    res.setHeader('Location', '/');
    res.end();
    return;
  }
  const content = client.contentManager.build({
    oneofKind: 'post',
    post: { text, images: imageSets },
  });
  await client.contentManager.save(content);
  const event = await client.buildEvent(content);
  const signedEvent = await client.signEvent(event);
  await client.commitEvent(signedEvent, content);
  await client.sync();
  res.statusCode = 303;
  res.setHeader('Location', '/');
  res.end();
});

route('POST', /^\/sync$/, async (_req, res) => {
  try {
    await client.sync();
  } catch (err) {
    console.error('sync failed:', err);
  }
  res.statusCode = 303;
  res.setHeader('Location', '/');
  res.end();
});

const server = createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';
  const match = routes.find((r) => r.method === method && r.pattern.test(url));
  if (!match) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  try {
    await match.handler(req, res);
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
