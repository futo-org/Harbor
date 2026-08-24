// Ask a running verifier bot to run every text verifier's health check.
//
// Pointed at the image a pipeline just built, this checks the artifact. Pointed
// at the deployment, it also catches a platform that blocks the cluster's
// egress and nothing else, which the bot's own test suite cannot see from a
// runner.
//
// The URL comes from VERIFIER_BOT_HEALTH_URL, or the first entry of
// EXPO_PUBLIC_POLYCENTRIC_VERIFIER_SERVERS.

const base = (
  process.env.VERIFIER_BOT_HEALTH_URL ||
  (process.env.EXPO_PUBLIC_POLYCENTRIC_VERIFIER_SERVERS ?? '').split(',')[0] ||
  ''
)
  .trim()
  .replace(/\/+$/, '');

if (!base) {
  console.error(
    'No verifier bot URL. Set VERIFIER_BOT_HEALTH_URL or ' +
      'EXPO_PUBLIC_POLYCENTRIC_VERIFIER_SERVERS.',
  );
  process.exit(2);
}

const TIMEOUT_MS = 60_000;

async function getJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { message: text.slice(0, 200) };
  }
  return { status: response.status, body };
}

console.log(`Checking ${base}`);

const platforms = await getJson(`${base}/platforms`);
if (platforms.status !== 200 || !Array.isArray(platforms.body)) {
  console.error(`Failed to list platforms (${platforms.status}).`);
  process.exit(1);
}

const failures = [];
for (const platform of platforms.body) {
  for (const type of platform.verifiers ?? []) {
    // OAuth verifiers need a live browser session, so they have no check.
    if (type !== 'text') continue;

    const url = `${base}/platforms/${platform.slug}/${type}/health-check`;
    let result;
    try {
      result = await getJson(url);
    } catch (e) {
      result = { status: 0, body: { message: String(e) } };
    }

    const ok = result.status === 200 && result.body?.success === true;
    const detail = ok
      ? ''
      : ` — ${result.body?.message ?? ''} ${result.body?.extendedMessage ?? ''}`.trimEnd();
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${platform.name} (${result.status})${detail}`,
    );
    if (!ok) failures.push(platform.name);
  }
}

if (failures.length > 0) {
  console.error(
    `\n${failures.length} verifier(s) failing: ${failures.join(', ')}`,
  );
  process.exit(1);
}

console.log('\nAll text verifiers healthy.');
