import { types } from '@polycentric/react-native';
import type { PolycentricClient } from '@polycentric/react-native';
import { bytesToHex } from './helpers';

export type PostStats = {
  likes: number;
  dislikes: number;
  comments: number;
  myOpinion: types.Opinion;
};

/**
 * Here we manually query the references feed once, walk the events, and
 * accumulate the stats we need in the client. The server has an endpoint
 * that can do this on our behalf, which we could use instead. If an event
 * has many references this can be costly.
 */
export async function fetchPostStats(
  client: PolycentricClient,
  pointer: types.Pointer,
): Promise<PostStats> {
  const feed = client.queryManager.queryReferencesFeed(pointer);
  const myKey = bytesToHex(client.currentSystem.key ?? new Uint8Array());

  const allEvents: types.SignedEvent[] = [];
  let page = await feed.read();
  while (page.length > 0) {
    allEvents.push(...page);
    if (!feed.hasMore) break;
    page = await feed.read();
  }

  const opinionsByAuthor = new Map<
    string,
    { clock: number; opinion: number }
  >();
  let comments = 0;

  for (const signedEvent of allEvents) {
    try {
      const ev = types.Event.fromBinary(signedEvent.event);
      const ct = Number(ev.contentType);

      if (ct === types.ContentType.OPINION) {
        const authorKey = ev.system?.key;
        if (!authorKey) continue;
        const key = bytesToHex(authorKey);
        const clock = Number(ev.logicalClock ?? 0);
        const existing = opinionsByAuthor.get(key);
        if (!existing || clock > existing.clock) {
          const opValue = ev.lwwElement?.value?.[0] ?? types.Opinion.NEUTRAL;
          opinionsByAuthor.set(key, { clock, opinion: opValue });
        }
      } else if (ct === types.ContentType.POST) {
        comments++;
      }
    } catch {}
  }

  let likes = 0;
  let dislikes = 0;
  for (const { opinion } of opinionsByAuthor.values()) {
    if (opinion === types.Opinion.LIKE) likes++;
    else if (opinion === types.Opinion.DISLIKE) dislikes++;
  }

  const myEntry = opinionsByAuthor.get(myKey);
  const myOpinion = myEntry
    ? (myEntry.opinion as types.Opinion)
    : types.Opinion.NEUTRAL;

  return { likes, dislikes, comments, myOpinion };
}
