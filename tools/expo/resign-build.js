#!/usr/bin/env node
// Turns an EAS store build into an archive you can install on a test device.
//
// Usage: node tools/expo/resign-build.js <build-id> [options]
//
//   --profile <path>   ad-hoc .mobileprovision  (default: $IOS_ADHOC_PROFILE)
//   --identity <name>  codesign identity        (default: $IOS_SIGNING_IDENTITY,
//                      otherwise the keychain's only signing identity)
//   --credentials <p>  credentials.json from `eas credentials`, whose
//                      certificate is imported when the keychain has none
//                      (default: ./credentials.json)
//   --output <path>    resigned archive         (default: ./harbor-adhoc.ipa)
//   --keep-store-ipa   leave the downloaded store archive in place
//
// Waits for the build to finish, downloads its archive, and re-signs it with
// the given profile. Only the signature, embedded profile and entitlements
// change: the executable and JS bundle are the ones that go to the store.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const POLL_INTERVAL_MS = 30_000;
const WAIT_TIMEOUT_MS = 90 * 60 * 1000;
const PENDING = new Set(['NEW', 'IN_QUEUE', 'IN_PROGRESS']);

function usage(message) {
  if (message) console.error(`${message}\n`);
  const source = fs.readFileSync(__filename, 'utf8').split('\n');
  console.error(
    source
      .slice(2, 15)
      .map((line) => line.replace(/^\/\/ ?/, ''))
      .join('\n'),
  );
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const options = {
    buildId: null,
    profile: process.env.IOS_ADHOC_PROFILE,
    identity: process.env.IOS_SIGNING_IDENTITY,
    credentials: 'credentials.json',
    output: 'harbor-adhoc.ipa',
    keepStoreIpa: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage();
    else if (arg === '--keep-store-ipa') options.keepStoreIpa = true;
    else if (arg === '--profile') options.profile = argv[++i];
    else if (arg === '--identity') options.identity = argv[++i];
    else if (arg === '--credentials') options.credentials = argv[++i];
    else if (arg === '--output') options.output = argv[++i];
    else if (arg.startsWith('-')) usage(`Unknown option: ${arg}`);
    else if (!options.buildId) options.buildId = arg;
    else usage(`Unexpected argument: ${arg}`);
  }

  if (!options.buildId) usage('A build id is required.');
  if (!options.profile) {
    usage(
      'Pass --profile, or set IOS_ADHOC_PROFILE, for the ad-hoc profile.\n' +
        'Creating one: docs/content/developer/e2e-testing.md',
    );
  }
  return options;
}

/** The signing identities the keychain can use, distribution ones first. */
function keychainIdentities() {
  const output = execFileSync(
    'security',
    ['find-identity', '-v', '-p', 'codesigning'],
    { encoding: 'utf8' },
  );
  const names = [...output.matchAll(/\)\s+([0-9A-F]{40})\s+"([^"]+)"/g)].map(
    (match) => match[2],
  );
  return [
    ...names.filter((name) => /distribution/i.test(name)),
    ...names.filter((name) => !/distribution/i.test(name)),
  ];
}

/**
 * The identity to sign with, importing the distribution certificate from
 * credentials.json when the keychain lacks one.
 */
function resolveIdentity(credentialsPath) {
  const existing = keychainIdentities();
  if (existing.some((name) => /distribution/i.test(name))) return existing[0];

  if (fs.existsSync(credentialsPath)) {
    const certificate = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
      ?.ios?.distributionCertificate;

    if (certificate?.path && certificate?.password) {
      const p12 = path.resolve(path.dirname(credentialsPath), certificate.path);
      console.error(`Importing the distribution certificate from ${p12}…`);
      execFileSync(
        'security',
        ['import', p12, '-P', certificate.password, '-T', '/usr/bin/codesign'],
        { stdio: 'inherit' },
      );

      const imported = keychainIdentities();
      if (imported.some((name) => /distribution/i.test(name))) {
        return imported[0];
      }
    }
  }

  if (existing.length > 0) {
    console.error(
      `No distribution certificate; signing with "${existing[0]}".\n` +
        'The profile has to have been issued against it.',
    );
    return existing[0];
  }
  throw new Error('No signing identity in the keychain. Pass --identity.');
}

function viewBuild(buildId) {
  const stdout = execFileSync(
    'npx',
    ['eas-cli', 'build:view', buildId, '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  return JSON.parse(stdout);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function downloadArchive(buildId, destination) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  for (;;) {
    const build = viewBuild(buildId);

    if (build.status === 'FINISHED') {
      const url = build.artifacts?.applicationArchiveUrl;
      if (!url) throw new Error(`Build ${buildId} finished without an archive`);
      if (build.platform !== 'IOS') {
        throw new Error(`Build ${buildId} is ${build.platform}, not iOS`);
      }

      console.error(`Downloading the ${build.buildProfile} archive…`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download: HTTP ${response.status}`);
      }
      fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
      return;
    }

    if (!PENDING.has(build.status)) {
      throw new Error(`Build ${buildId} is ${build.status}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Build ${buildId} is still ${build.status}`);
    }

    console.error(`Build is ${build.status}; waiting…`);
    await sleep(POLL_INTERVAL_MS);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const identity =
    options.identity ?? resolveIdentity(path.resolve(options.credentials));

  const storeIpa = `${options.output.replace(/\.ipa$/, '')}-store.ipa`;
  await downloadArchive(options.buildId, storeIpa);

  execFileSync(
    path.join(__dirname, 'resign-ipa.sh'),
    [storeIpa, options.profile, identity, options.output],
    { stdio: 'inherit' },
  );

  if (!options.keepStoreIpa) fs.rmSync(storeIpa, { force: true });
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
