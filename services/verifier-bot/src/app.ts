import * as dotenv from 'dotenv';
dotenv.config({ path: './.env' });

import { mkdirSync } from 'node:fs';
import { ObjectId } from 'bson';
import cors from 'cors';
import express from 'express';
import { StatusCodes } from 'http-status-codes';
import { platforms } from './platforms/platforms.js';
import {
  decodeObject,
  handleBinaryOrJson,
  slug,
  writeResult,
} from './utility.js';
import { OAuthVerifier, TextVerifier } from './verifier.js';

import type { PolycentricClient } from '@polycentric/js-core';
import { createPolycentricNodeClient } from '@polycentric/js-node';

const oauthSecrets = new Map<
  string,
  { secret: string; timeoutId: NodeJS.Timeout }
>();
const OAUTH_SECRET_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

function storeOAuthSecret(token: string, secret: string) {
  clearTimeout(oauthSecrets.get(token)?.timeoutId);
  const timeoutId = setTimeout(() => {
    oauthSecrets.delete(token);
  }, OAUTH_SECRET_TIMEOUT_MS);
  oauthSecrets.set(token, { secret, timeoutId });
}

function retrieveOAuthSecret(token: string): string | undefined {
  const entry = oauthSecrets.get(token);
  if (entry) {
    clearTimeout(entry.timeoutId);
    oauthSecrets.delete(token);
    return entry.secret;
  }
  return undefined;
}

async function loadClient(): Promise<PolycentricClient> {
  // Comma-delimited list of servers.
  const servers = (
    process.env.POLYCENTRIC_VERIFIER_BOT_SERVERS ||
    'https://east.polycentric.dev'
  )
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // better-sqlite3 won't create missing parent directories.
  mkdirSync('./state/blobs', { recursive: true });

  // Reusing the same paths keeps a stable bot identity across restarts: the
  // key pair (and its published Identity) are restored from SQLite on boot.
  const client = await createPolycentricNodeClient({
    databasePath: './state/polycentric.db',
    blobDirectory: './state/blobs',
    seedServers: servers,
  });

  // First run: no identity yet — publish one for the bot's current key pair.
  if (!client.activeIdentityKey) {
    if (!client.currentKeyPair) {
      throw new Error('Client has no key pair after initialization.');
    }
    console.log('Publishing new bot identity');
    await client.identityManager.publish(
      null,
      [client.currentKeyPair.publicKey],
      [],
    );
  }

  try {
    await client.sync();
  } catch (e) {
    console.warn('Initial sync failed:', e);
  }

  return client;
}

(async () => {
  const client = await loadClient();
  console.log(
    `Identity loaded (identityKey: ${
      client.activeIdentityKey
    }, key: ${Buffer.from(
      client.currentKeyPair?.publicKey.key ?? new Uint8Array(),
    ).toString('base64')})`,
  );

  const app = express();
  app.use(express.json());

  app.use(
    cors({
      origin: (
        process.env.POLYCENTRIC_VERIFIER_BOT_ALLOWED_ORIGINS ||
        'https://localhost:3000,http://localhost:3000,https://app.polycentric.io,https://staging-web.polycentric.io,https://web.polycentric.io,https://polycentric.io'
      ).split(','),
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'x-polycentric-user-agent',
        'Origin',
        'Accept',
      ],
    }),
  );

  // Log all requests
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] Incoming request:`, {
      method: req.method,
      url: req.url,
      headers: req.headers,
    });
    next();
  });

  // The Polycentric identity the bot publishes verifications under. Clients
  // need this to recognise (and trust) verifications produced by this bot.
  app.get('/identity', (_req, res) => {
    try {
      res.status(200).json({ identity: client.activeIdentityKey });
    } catch (e: unknown) {
      const requestId: string = new ObjectId().toString();
      console.error(`[500 ERROR] (${requestId}) GET /identity \n${String(e)}`);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: `An unknown error has occurred (Request Id: ${requestId})`,
        extendedMessage: 'Internal server error while getting the bot identity',
      });
    }
  });

  app.get('/platforms', (_req, res) => {
    try {
      res
        .json(
          platforms.map((platform) => {
            return { name: platform.name, slug: slug(platform.name) };
          }),
        )
        .status(200);
    } catch (e: unknown) {
      const requestId: string = new ObjectId().toString();
      console.error(`[500 ERROR] (${requestId}) GET /platforms \n${String(e)}`);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: `An unknown error has occurred (Request Id: ${requestId})`,
        extendedMessage:
          'Internal server error while getting list of platforms',
      });
    }
  });

  app.get('/platforms/:platformName/oauth/callback', (req, res) => {
    try {
      const { code, oauth_token, oauth_verifier, state } = req.query;
      let queryObject: Record<string, any> = {};
      const platformIdentifier = req.params.platformName;

      if (
        oauth_token &&
        typeof oauth_token === 'string' &&
        oauth_verifier &&
        typeof oauth_verifier === 'string'
      ) {
        const secret = retrieveOAuthSecret(oauth_token);
        if (!secret) {
          console.error(
            `OAuth secret not found or expired for token: ${oauth_token}`,
          );
          res
            .status(StatusCodes.BAD_REQUEST)
            .send('OAuth session expired or invalid.');
          return;
        }
        queryObject = {
          oauth_token: oauth_token,
          oauth_verifier: oauth_verifier,
          secret: secret,
        };
      } else if (code && typeof code === 'string') {
        queryObject = { code };
        if (state && typeof state === 'string') {
          queryObject.state = state;
        }
      } else {
        res
          .status(StatusCodes.BAD_REQUEST)
          .send('Missing required OAuth parameters in callback.');
        return;
      }

      const encodedData = Buffer.from(JSON.stringify(queryObject)).toString(
        'base64',
      );

      const webAppBaseUrl =
        process.env.POLYCENTRIC_VERIFIER_BOT_WEB_APP_URL ||
        'https://polycentric.io';
      const webAppCallbackPath = '/oauth/callback';

      const redirectState = JSON.stringify({
        data: encodedData,
        claimType: platformIdentifier,
      });
      const redirectUrl = `${webAppBaseUrl.replace(
        /\/$/,
        '',
      )}${webAppCallbackPath}?state=${encodeURIComponent(redirectState)}`;
      res.redirect(redirectUrl);
    } catch (e: unknown) {
      const requestId: string = new ObjectId().toString();
      console.error(
        `[500 ERROR] (${requestId}) GET /platforms/:platformName/oauth/callback \n${String(
          e,
        )}`,
      );
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: `An unknown error has occurred (Request Id: ${requestId})`,
        extendedMessage:
          'Internal server error during OAuth callback processing',
      });
    }
  });

  for (const platform of platforms) {
    app.get(`/platforms/${slug(platform.name)}`, (_req, res) => {
      try {
        res
          .json(
            platform.verifiers.map((verifier) => {
              return {
                verifierType: verifier.verifierType,
                platform: platform.name,
                slug: slug(platform.name),
              };
            }),
          )
          .status(200);
      } catch (e: unknown) {
        const requestId: string = new ObjectId().toString();
        console.error(
          `[500 ERROR] (${requestId}) GET /platforms/${
            platform.name
          } \n${String(e)}`,
        );
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
          message: `An unknown error has occurred (Request Id: ${requestId})`,
          extendedMessage: 'Internal server error while fetching platforms',
        });
      }
    });

    for (const verifier of platform.verifiers) {
      const name = slug(platform.name);
      await verifier.init();

      app.post(
        `/platforms/${name}/${verifier.verifierType}/verify`,
        handleBinaryOrJson,
        async (req, res) => {
          try {
            const verifyResult = await verifier.requestVerify(client, req);

            const contentType = req.headers['content-type'];
            if (verifyResult.success) {
              if (contentType === 'application/octet-stream') {
                // Raw EventKey bytes of the verify event.
                const responseBuffer = Buffer.from(verifyResult.value, 'hex');
                res.setHeader('Content-Type', 'application/octet-stream');
                res.status(StatusCodes.OK).send(responseBuffer);
              } else {
                res
                  .status(StatusCodes.OK)
                  .json({ verifyEventId: verifyResult.value });
              }
            } else {
              res
                .status(
                  verifyResult.error.statusCode ??
                    StatusCodes.INTERNAL_SERVER_ERROR,
                )
                .json({
                  message: verifyResult.error.message,
                  extendedMessage: verifyResult.error.extendedMessage,
                });
            }
          } catch (e: unknown) {
            const requestId: string = new ObjectId().toString();
            console.error(
              `[500 ERROR] (${requestId}) POST /platforms/${name}/${
                verifier.verifierType
              }/verify \n${String(e)}`,
            );
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
              message: `An unknown error has occurred (Request Id: ${requestId})`,
              extendedMessage: 'Internal server error while handling verify',
            });
          }
        },
      );

      if (verifier instanceof OAuthVerifier) {
        app.get(
          `/platforms/${name}/${verifier.verifierType}/url`,
          async (_req, res) => {
            try {
              const result = await verifier.getOAuthURL();
              if (result.success) {
                if (typeof result.value === 'string') {
                  res.status(StatusCodes.OK).json({ url: result.value });
                } else if (
                  typeof result.value === 'object' &&
                  'url' in result.value &&
                  'token' in result.value &&
                  'secret' in result.value
                ) {
                  storeOAuthSecret(result.value.token, result.value.secret);
                  res.status(StatusCodes.OK).json({ url: result.value.url });
                } else {
                  console.error(
                    `[500 ERROR] Unexpected success value format from getOAuthURL for platform ${name}`,
                  );
                  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    message:
                      'Internal server error: Unexpected response format from verifier.',
                    extendedMessage:
                      'Verifier returned an unexpected success value format.',
                  });
                }
              } else {
                writeResult(res, result);
              }
            } catch (e: unknown) {
              const requestId: string = new ObjectId().toString();
              console.error(
                `[500 ERROR] (${requestId}) GET /platforms/${name}/${
                  verifier.verifierType
                }/url \n${String(e)}`,
              );
              res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                message: `An unknown error has occurred (Request Id: ${requestId})`,
                extendedMessage:
                  'Internal server error while fetching OAuth URL',
              });
            }
          },
        );

        app.get(
          `/platforms/${name}/${verifier.verifierType}/token`,
          async (req, res) => {
            try {
              const challenge = req.query.oauthData as string;
              if (!challenge) {
                res.status(StatusCodes.BAD_REQUEST).json({
                  message: 'Missing oauthData parameter',
                  extendedMessage:
                    'The required oauthData query parameter was not provided.',
                });
                return;
              }
              const challengeResponse = decodeObject<any>(challenge);
              writeResult(res, await verifier.getToken(challengeResponse));
            } catch (e: unknown) {
              const requestId: string = new ObjectId().toString();
              console.error(
                `[500 ERROR] (${requestId}) GET /platforms/${name}/${
                  verifier.verifierType
                }/token \n${String(e)}`,
              );
              if (e instanceof SyntaxError) {
                res.status(StatusCodes.BAD_REQUEST).json({
                  message: 'Invalid format for oauthData parameter',
                  extendedMessage: `Failed to decode base64 or parse JSON: ${e.message}`,
                });
              } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                  message: `An unknown error has occurred (Request Id: ${requestId})`,
                  extendedMessage: `Internal server error while processing OAuth token: ${
                    e instanceof Error ? e.message : String(e)
                  }`,
                });
              }
            }
          },
        );
      }

      if (verifier instanceof TextVerifier) {
        app.post(
          `/platforms/${name}/${verifier.verifierType}/get-claim-fields-by-url`,
          async (req, res) => {
            try {
              return writeResult(
                res,
                await verifier.getClaimFieldsByUrl(req.body.url),
              );
            } catch (e: unknown) {
              const requestId: string = new ObjectId().toString();
              console.error(
                `[500 ERROR] (${requestId}) POST /platforms/${name}/${
                  verifier.verifierType
                }/get-claim-fields-by-url \n${String(e)}`,
              );
              res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                message: `An unknown error has occurred (Request Id: ${requestId})`,
                extendedMessage:
                  'Internal server error while fetching claim fields',
              });
            }
          },
        );
      }

      app.get(
        `/platforms/${name}/${verifier.verifierType}/health-check`,
        async (_req, res) => {
          try {
            return writeResult(res, await verifier.healthCheck());
          } catch (e: unknown) {
            const requestId: string = new ObjectId().toString();
            console.error(
              `[500 ERROR] (${requestId}) GET /platforms/${name}/${
                verifier.verifierType
              }/health-check \n${String(e)}`,
            );
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
              message: `An unknown error has occurred (Request Id: ${requestId})`,
              extendedMessage:
                'Internal server error while processing health checks',
            });
          }
        },
      );

      console.log(
        `Initialized verifier with type '${verifier.verifierType}' for platform '${verifier.platform}' (route '${name}').`,
      );
    }
  }
  app.listen(3002, () => {
    console.log(`Verifiers server listening on port ${3002}`);
  });
})();
