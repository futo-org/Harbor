#!/usr/bin/env node
// Waits until staging runs develop: first the latest server and web staging
// deploys, then the Flux rollout, until server and web serve on /version the
// commit their chart's `staging` tag pins.
// Env: GITHUB_SERVER_URL, GITHUB_REPOSITORY (set by Forgejo).

import { appendFileSync } from 'node:fs';
import { chartAt } from './registry-helpers.mjs';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

const DEPLOY_TIMEOUT_MS = 45 * MINUTE;
const DEPLOY_POLL_MS = 30 * SECOND;
const ROLLOUT_TIMEOUT_MS = 10 * MINUTE;
const ROLLOUT_POLL_MS = 10 * SECOND;
// Old and new pods both answer for a while during a rolling update.
const ROLLOUT_MATCHES_NEEDED = 3;

const DEPLOY_WORKFLOWS = [
  'deploy-server-staging.yml',
  'deploy-web-staging.yml',
];
const STAGING_VERSION_URL_BY_CHART = {
  'harbor-server': 'https://srv.staging.harbor.social/version',
  'harbor-web': 'https://staging.harbor.social/version',
};

const env = process.env;

await waitForDeploys();
await waitForRollout();

async function waitForDeploys() {
  const deadline = Date.now() + DEPLOY_TIMEOUT_MS;
  let lastState;
  for (;;) {
    let state;
    try {
      const deployRuns = await Promise.all(DEPLOY_WORKFLOWS.map(findLatestRun));
      const failedRun = deployRuns.find(
        (run) => isFinal(run.status) && run.status !== 'success',
      );
      if (failedRun) {
        fail(
          `Staging deploy ${failedRun.status}: ${describeRun(failedRun)} ${failedRun.html_url}`,
        );
      }
      if (deployRuns.every((run) => run.status === 'success')) {
        console.log('Staging deploys succeeded');
        return;
      }
      state = deployRuns
        .map((run) => `${describeRun(run)}: ${run.status}`)
        .join(', ');
    } catch (error) {
      state = `runs API: ${error.message}`;
    }
    lastState = logChange(lastState, state);
    if (Date.now() > deadline) fail(`Staging deploys timed out: ${state}`);
    await sleep(DEPLOY_POLL_MS);
  }
}

async function waitForRollout() {
  const deadline = Date.now() + ROLLOUT_TIMEOUT_MS;
  let lastState;
  let matchesInARow = 0;
  for (;;) {
    let state;
    try {
      const versions = await Promise.all(
        Object.entries(STAGING_VERSION_URL_BY_CHART).map(readVersions),
      );
      matchesInARow = versions.every(({ wanted, live }) => wanted === live)
        ? matchesInARow + 1
        : 0;
      if (matchesInARow >= ROLLOUT_MATCHES_NEEDED) {
        console.log(`Staging runs ${describe(versions)}`);
        return;
      }
      state = describe(versions);
    } catch (error) {
      matchesInARow = 0;
      state = `registry: ${error.message}`;
    }
    lastState = logChange(lastState, state);
    if (Date.now() > deadline) fail(`Staging rollout timed out: ${state}`);
    await sleep(ROLLOUT_POLL_MS);
  }
}

// Each workflow's deploys run one at a time in push order (its concurrency
// group), so once the latest is done, so are the ones before it. It may be
// this commit's, an earlier commit's still deploying, or a newer commit's,
// which cancels this run anyway.
async function findLatestRun(workflowId) {
  const response = await fetch(
    `${env.GITHUB_SERVER_URL}/api/v1/repos/${env.GITHUB_REPOSITORY}/actions/runs?workflow_id=${workflowId}&ref=refs/heads/develop&event=push&limit=1&page=1`,
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()).workflow_runs[0];
}

function describeRun(run) {
  return `${run.workflow_id} (${run.commit_sha.slice(0, 8)})`;
}

function isFinal(status) {
  return ['success', 'failure', 'cancelled', 'skipped'].includes(status);
}

// The commit the chart's `staging` tag pins, and the one its pods serve.
async function readVersions([chart, url]) {
  const wanted = (await chartAt(chart, 'staging'))?.commit;
  if (!wanted) throw new Error(`${chart} has no staging tag`);
  return { chart, wanted, live: await readLiveVersion(url) };
}

// Anything but a commit (404 before the first deploy that sets it, an error
// page, a refused connection) is reported as is and means "not yet".
async function readLiveVersion(url) {
  try {
    const response = await fetch(url);
    const body = (await response.text()).trim();
    return response.ok && /^[0-9a-f]{40}$/.test(body)
      ? body
      : `HTTP ${response.status}`;
  } catch (error) {
    return error.cause?.code ?? error.message;
  }
}

function describe(versions) {
  return versions
    .map(
      ({ chart, wanted, live }) =>
        `${chart} ${shorten(live)} (want ${shorten(wanted)})`,
    )
    .join(', ');
}

function shorten(version) {
  return /^[0-9a-f]{40}$/.test(version) ? version.slice(0, 8) : version;
}

function logChange(lastState, state) {
  if (state !== lastState) console.log(state);
  return state;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
  console.error(message);
  // The workflow's failure report quotes it.
  if (env.GITHUB_OUTPUT)
    appendFileSync(env.GITHUB_OUTPUT, `failure=${message}\n`);
  process.exit(1);
}
