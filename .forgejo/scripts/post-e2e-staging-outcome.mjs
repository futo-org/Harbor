#!/usr/bin/env node
// Posts a failed e2e-staging step, or the first pass after a failed run, to
// Zulip: the commit and the run, then why e2e didn't run.
// wait-staging.mjs imports it; workflow steps run
// `node post-e2e-staging-outcome.mjs --failed ['<why not run>']`, with no
// reason when the flows ran and failed, or `--passed` after the flows passed,
// which posts only if the previous run failed.
// Env: COMMIT_MESSAGE, Forgejo's GITHUB_SHA, GITHUB_REF_NAME,
// GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_NUMBER, plus
// ZULIP_BOT_EMAIL and ZULIP_BOT_API_KEY.

import { postToZulip } from './zulip-helpers.mjs';

const env = process.env;
const repoUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`;

if (import.meta.main) {
  const [mode, whyNotRun] = process.argv.slice(2);
  if (mode !== '--failed' && mode !== '--passed') {
    throw new Error(`Unknown mode ${mode}: expected --failed or --passed`);
  }
  try {
    if (mode === '--passed') await postE2eStagingRecovery();
    else await postE2eStagingFailure(whyNotRun);
  } catch (error) {
    console.error(error);
  }
}

export async function postE2eStagingFailure(whyNotRun) {
  await postE2eStagingOutcome(
    whyNotRun
      ? ':orange_circle: **E2E not run**'
      : ':red_circle: **E2E failed**',
    whyNotRun,
  );
}

// Posts only if the previous finished run on this branch failed. Cancelled
// runs don't count, and this one is still running so it isn't listed.
async function postE2eStagingRecovery() {
  const response = await fetch(
    `${env.GITHUB_SERVER_URL}/api/v1/repos/${env.GITHUB_REPOSITORY}/actions/runs?workflow_id=e2e-staging.yml&status=success&status=failure`,
  );
  if (!response.ok) {
    throw new Error(
      `Forgejo: HTTP ${response.status} ${await response.text()}`,
    );
  }
  const { workflow_runs } = await response.json();
  const previous = workflow_runs.find(
    (run) => run.prettyref === env.GITHUB_REF_NAME,
  );
  if (previous?.status === 'failure') {
    await postE2eStagingOutcome(':green_circle: **E2E passing again**');
  }
}

async function postE2eStagingOutcome(outcome, details) {
  const commitTitle = (env.COMMIT_MESSAGE ?? '').split('\n')[0];
  const content = [
    `${outcome} on [\`${env.GITHUB_SHA.slice(0, 8)}\`](${repoUrl}/commit/${env.GITHUB_SHA}) ${commitTitle} - [Run #${env.GITHUB_RUN_NUMBER}](${repoUrl}/actions/runs/${env.GITHUB_RUN_NUMBER})`,
    details,
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
