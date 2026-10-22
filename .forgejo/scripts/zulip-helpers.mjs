const ZULIP_URL = 'https://zulip.futo.org';

const env = process.env;

// `stream` is a channel's ID (the number in its URL) or name. Zulip creates
// the topic on the first post to it.
export async function postToZulip(stream, topic, content) {
  const credentials = Buffer.from(
    `${env.ZULIP_BOT_EMAIL}:${env.ZULIP_BOT_API_KEY}`,
  ).toString('base64');
  const response = await fetch(`${ZULIP_URL}/api/v1/messages`, {
    method: 'POST',
    headers: { authorization: `Basic ${credentials}` },
    body: new URLSearchParams({
      type: 'stream',
      to: String(stream),
      topic,
      content,
    }),
  });
  if (!response.ok) {
    throw new Error(`Zulip: HTTP ${response.status} ${await response.text()}`);
  }
}
