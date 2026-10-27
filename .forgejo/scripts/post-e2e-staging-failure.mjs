#!/usr/bin/env node
// Posts a failed e2e-staging step to Zulip: the commit and the run, then why
// e2e didn't run. wait-staging.mjs imports it; workflow steps run
// `node post-e2e-staging-failure.mjs ['<why not run>']`, with no argument
// when the flows ran and failed.
// Env: COMMIT_MESSAGE, Forgejo's GITHUB_SHA, GITHUB_SERVER_URL,
// GITHUB_REPOSITORY, GITHUB_RUN_NUMBER, plus ZULIP_BOT_EMAIL and
// ZULIP_BOT_API_KEY.

import { postToZulip } from './zulip-helpers.mjs';

const env = process.env;

if (import.meta.main) await postE2eStagingFailure(process.argv[2]);

export async function postE2eStagingFailure(whyNotRun) {
  const repoUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`;
  const commitTitle = (env.COMMIT_MESSAGE ?? '').split('\n')[0];
  const outcome = whyNotRun
    ? ':orange_circle: **E2E not run**'
    : ':red_circle: **E2E failed**';
  const content = [
    `${outcome} on [\`${env.GITHUB_SHA.slice(0, 8)}\`](${repoUrl}/commit/${env.GITHUB_SHA}) ${commitTitle} - [Run #${env.GITHUB_RUN_NUMBER}](${repoUrl}/actions/runs/${env.GITHUB_RUN_NUMBER})`,
    whyNotRun,
  ]
    .filter(Boolean)
    .join('\n');

  await postToZulip(
    // #harbor-alerts
    123,
    'harbor-staging',
    content,
  );
}
