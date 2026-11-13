#!/usr/bin/env node
// Turns the GitLab rules (changed paths + ref conditions) into the plan that
// pr.yml gates its jobs with: `flags` (one per job) and `matrix` rows (one
// per grouped job). Needs a full clone.
//
// Env: GITHUB_*, REGISTRY, EVENT_BEFORE.

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const env = process.env;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

// Run context ---------------------------------------------------------------

const event = env.GITHUB_EVENT_NAME;
const pr = event === 'pull_request';
const isTag = env.GITHUB_REF.startsWith('refs/tags/');

// Changed files -------------------------------------------------------------
// null = every path matches (manual runs, GitLab web pipelines); [] = none.

const changedFiles = () => {
  if (isTag) return [];
  if (pr) {
    const base = git('merge-base', `origin/${env.GITHUB_BASE_REF}`, 'HEAD');
    return git('diff', '--name-only', base, 'HEAD').split('\n');
  }
  const before = env.EVENT_BEFORE;
  if (event === 'push' && before && !/^0+$/.test(before)) {
    try {
      return git('diff', '--name-only', before, env.GITHUB_SHA).split('\n');
    } catch {
      // `before` is not in the clone (force push): treat as all changed.
    }
  }
  return null;
};
const changed = changedFiles();
console.log(
  changed === null
    ? 'changed files: all'
    : `changed files:\n${changed.join('\n')}`,
);

// Patterns are regexes or path prefixes.
const touches = (...patterns) =>
  changed === null ||
  changed.some((file) =>
    patterns
      .flat()
      .some((p) => (typeof p === 'string' ? file.startsWith(p) : p.test(file))),
  );

// Source rules (GitLab `changes:`) ------------------------------------------

const CARGO = /^Cargo\.(toml|lock)$/;
const LOCK = /^pnpm-lock\.yaml$/;
const CHARTS = 'deploy/charts/';
const NODE_ROOT = [
  LOCK,
  /^pnpm-workspace\.yaml$/,
  /^package\.json$/,
  'tools/',
  'patches/',
];
const SERVER_STACK = [
  'services/server/',
  'services/common/',
  /^compose\.yml$/,
  '.forgejo/scripts/integration-server.sh',
];

const rsCore = touches(CARGO, /^packages\/rs-[^/]+\//);
const jsSdk = touches(LOCK, /^packages\/js-[^/]+\//);
const rnSdk = touches(LOCK, 'packages/react-native/');
const ktCore = touches(
  /^Cargo\.lock$/,
  'packages/kt-core/',
  'packages/rs-core/',
  'packages/rs-common/',
  'protos/',
);
const server = touches(CARGO, SERVER_STACK, CHARTS);
const serverIntegration = touches(CARGO, SERVER_STACK);
const moderation = touches(
  CARGO,
  'services/moderation/',
  'services/common/',
  CHARTS,
);
const moderationIntegration = touches(
  'services/moderation/',
  'services/server/',
  /^compose\.yml$/,
  '.forgejo/scripts/integration-moderation.sh',
);
const pushNotifications = touches(
  CARGO,
  'services/push-notifications/',
  'services/common/',
  CHARTS,
);
const otlp = touches(CARGO, 'services/otlp/', 'services/common/', CHARTS);
const grayjayMigrator = touches(
  CARGO,
  'services/grayjay-migrator/',
  'services/moderation/entity/',
  'services/common/',
  CHARTS,
);
const scraper = touches(NODE_ROOT, 'services/scraper/', CHARTS);
const verifierBot = touches(
  NODE_ROOT,
  /^packages\/js-[^/]+\//,
  'packages/rs-core-wasm/',
  'services/verifier-bot/',
  CHARTS,
);
const app = touches(LOCK, 'apps/harbor/', CHARTS);
// Packages the app's web export, so it is rebuilt with the app as well.
const browserExtension = touches(LOCK, 'apps/harbor-browser-extension/');
// What the web image is built from.
const web = app || jsSdk || rnSdk || rsCore;
const docs = touches('docs/', 'protos/polycentric/v2/', /^buf\.yaml$/);
const charts = touches(
  CHARTS,
  NODE_ROOT,
  'packages/',
  'apps/',
  CARGO,
  'services/',
);

// CI rules ------------------------------------------------------------------
// A job also reruns when an action or script it uses changes, and every job
// when the workflow or what plans it does (GitLab: the job's include file),
// not on any .forgejo change.

// The actions and scripts `text` uses, and those they use.
const ciFiles = (text) => {
  const files = new Set();
  const scan = (text) => {
    for (const [, name] of text.matchAll(/\.\/\.forgejo\/actions\/([\w-]+)/g)) {
      const file = `.forgejo/actions/${name}/action.yml`;
      if (files.has(file) || !existsSync(file)) continue;
      files.add(file);
      scan(readFileSync(file, 'utf8'));
    }
    for (const [, name] of text.matchAll(/\.forgejo\/scripts\/([\w.-]+)/g)) {
      files.add(`.forgejo/scripts/${name}`);
    }
  };
  scan(text);
  return [...files];
};
const PR_WORKFLOW = '.forgejo/workflows/pr.yml';
const prWorkflow = readFileSync(PR_WORKFLOW, 'utf8');
// One block of text for each job, starting at its id.
const prJobs = prWorkflow
  .slice(prWorkflow.search(/^jobs:$/m))
  .split(/^(?= {2}[\w-]+:$)/m)
  .slice(1);
const planChanged = touches(
  PR_WORKFLOW,
  ciFiles(prJobs.find((job) => job.startsWith('  changes:')) ?? ''),
);
// Whether what the jobs gated on `flag` use has changed.
const ciChanged = (flag) => {
  const gated = new RegExp(`\\.flags\\.${flag}\\b`);
  return (
    planChanged ||
    touches(prJobs.filter((job) => gated.test(job)).flatMap(ciFiles))
  );
};
const withCi = (flags) =>
  Object.fromEntries(
    Object.entries(flags).map(([name, on]) => [name, on || ciChanged(name)]),
  );

// Jobs ----------------------------------------------------------------------

const flags = {
  ...withCi({
    workflows: touches('.forgejo/'),
    scan: pr,
    rs_core_lint: rsCore,
    rust_services_lint:
      server || moderation || pushNotifications || otlp || grayjayMigrator,
    services_db_schema: server || moderation || pushNotifications,
    js_sdk_lint: jsSdk,
    js_services_lint: scraper || verifierBot,
    charts_lint: charts,
    docs_lint: docs,
    app_lint: app || browserExtension,
    generated_code: jsSdk || touches('protos/', /^buf\.gen\.yaml$/),
    rs_core: rsCore,
    js_sdk: jsSdk || rsCore,
    rust_services:
      server || moderation || pushNotifications || otlp || grayjayMigrator,
    scraper,
    app,
    app_typecheck: app || jsSdk || rnSdk || rsCore,
    build_sdks: rsCore || jsSdk || rnSdk || app || verifierBot,
    build_rn_sdk: rnSdk || rsCore || app,
    kt_core_lint: ktCore,
    kt_core_build: ktCore,
    image_scraper: scraper,
    image_verifier_bot: verifierBot,
    web_image: web,
    browser_extension: app || browserExtension || jsSdk || rnSdk || rsCore,
    server_integration: serverIntegration,
    moderation_integration: moderationIntegration,
    scraper_integration: scraper,
    verifier_bot_tests: verifierBot,
    // Every PR, on staging's web and server images where it builds none.
    web_e2e: pr,
    docs,
    docs_preview: docs && pr,
  }),
};

// Matrix rows ---------------------------------------------------------------
// `image` is the id (artifacts, cache keys), `label` what the UI shows.

const rustServices = [
  {
    image: 'server',
    label: 'server',
    dockerfile: 'services/server',
    packages: 'server server-migration',
    changed: server,
  },
  {
    image: 'moderation-service',
    label: 'moderation',
    dockerfile: 'services/moderation',
    packages: 'moderation-service moderation-migration',
    changed: moderation,
  },
  {
    image: 'push-notifications-service',
    label: 'push notifications',
    dockerfile: 'services/push-notifications',
    packages: 'push-notifications-service push-notifications-migration',
    changed: pushNotifications,
  },
  {
    image: 'otlp-service',
    label: 'otlp',
    dockerfile: 'services/otlp',
    packages: 'otlp-service',
    changed: otlp,
  },
  {
    image: 'grayjay-migrator',
    label: 'grayjay migrator',
    dockerfile: 'services/grayjay-migrator',
    packages: 'grayjay-migrator grayjay-migrator-migration',
    changed: grayjayMigrator,
  },
];

const matrix = {
  service_images: rustServices
    .filter((s) => s.changed || ciChanged('service_images'))
    .map(({ image, label, dockerfile, packages }) => ({
      image,
      label: `Build ${label} image`,
      dockerfile,
      packages,
    })),
};
for (const [name, rows] of Object.entries(matrix)) {
  flags[name] = rows.length > 0;
  matrix[name] = { include: rows };
}
// Forgejo creates no job from an empty matrix and blocks whatever needs it:
// the integration tests need this one.
if (!flags.service_images) {
  matrix.service_images.include.push({ label: 'Build service images' });
}
// The tags web e2e runs: this run's image where it builds one, else staging's.
const built = (build) => (build ? env.GITHUB_SHA : 'staging');
const images = {
  web: built(flags.web_image),
  server: built(
    matrix.service_images.include.some((r) => r.image === 'server'),
  ),
};
// A job rerun for its CI files needs what it runs on.
flags.docs ||= flags.docs_preview;
// Jobs that download the SDK artifacts (sdk-artifacts action) need them built.
flags.build_sdks ||=
  flags.web_e2e ||
  flags.image_verifier_bot ||
  flags.verifier_bot_tests ||
  flags.web_image ||
  flags.browser_extension ||
  flags.app_typecheck ||
  flags.js_sdk;
flags.build_rn_sdk ||= flags.web_image || flags.browser_extension;

// Outputs -------------------------------------------------------------------

const out = (name, value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  appendFileSync(env.GITHUB_OUTPUT, `${name}=${text}\n`);
  console.log(`${name}=${text}`);
};
out('registry', env.REGISTRY);
// CI images are tagged by the content of .forgejo/images; unchanged inputs
// mean an existing tag and no build.
out('images_tag', git('rev-parse', 'HEAD:.forgejo/images').slice(0, 12));
out('plan', { flags, matrix, images });
