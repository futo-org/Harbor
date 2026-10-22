#!/usr/bin/env node
// Reports a failed e2e-staging run: which job failed, and for e2e, what the
// wait step or the flows reported. Does nothing when no job failed.
// Env: NEEDS (the workflow's `needs` as JSON), COMMIT_MESSAGE, and Forgejo's
// GITHUB_SHA, GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_NUMBER, plus
// ZULIP_BOT_EMAIL and ZULIP_BOT_API_KEY.

import { postToZulip } from './zulip-helpers.mjs';

const env = process.env;
const jobs = JSON.parse(env.NEEDS);
const failedJobs = Object.keys(jobs).filter(
  (name) => jobs[name].result === 'failure',
);
if (failedJobs.length === 0) process.exit(0);

const repoUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`;
const commitTitle = (env.COMMIT_MESSAGE ?? '').split('\n')[0];
const reason = !failedJobs.includes('e2e')
  ? `CI setup failed before e2e: ${failedJobs.join(', ')}`
  : jobs.e2e.outputs.wait_failure || 'Web e2e flows failed';
const content = [
  `:red_circle: Staging e2e failed on [\`${env.GITHUB_SHA.slice(0, 8)}\`](${repoUrl}/commit/${env.GITHUB_SHA}) ${commitTitle}`,
  reason,
  `[Run #${env.GITHUB_RUN_NUMBER}](${repoUrl}/actions/runs/${env.GITHUB_RUN_NUMBER})`,
].join('\n');
console.log(content);

// Channel 4 is where the existing harbor/harbor hooks post.
await postToZulip(4, 'staging-e2e', content);
