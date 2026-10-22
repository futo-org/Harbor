#!/usr/bin/env node
// Posts a failed e2e-staging step to Zulip: the commit, what failed and the
// run. wait-staging.mjs imports it; workflow steps run
// `node post-e2e-staging-failure.mjs '<what failed>'`.
// Env: COMMIT_MESSAGE, Forgejo's GITHUB_SHA, GITHUB_SERVER_URL,
// GITHUB_REPOSITORY, GITHUB_RUN_NUMBER, plus ZULIP_BOT_EMAIL and
// ZULIP_BOT_API_KEY.

import { postToZulip } from './zulip-helpers.mjs';

const env = process.env;

if (import.meta.main) await postE2eStagingFailure(process.argv[2]);

export async function postE2eStagingFailure(whatFailed) {
  const repoUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`;
  const commitTitle = (env.COMMIT_MESSAGE ?? '').split('\n')[0];
  const content = [
    `:red_circle: Staging e2e failed on [\`${env.GITHUB_SHA.slice(0, 8)}\`](${repoUrl}/commit/${env.GITHUB_SHA}) ${commitTitle}`,
    whatFailed,
    `[Run #${env.GITHUB_RUN_NUMBER}](${repoUrl}/actions/runs/${env.GITHUB_RUN_NUMBER})`,
  ].join('\n');

  // Channel 4 is #harbor
  await postToZulip(4, 'staging-e2e', content);
}
