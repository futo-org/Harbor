import { useContext, useEffect, useState } from 'react';
import { ClientContext } from '../../main';
import { v2 } from '@polycentric/js-core';
import type { DecodedEvent } from './event-card';
import { EventCard } from './event-card';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/** A snapshot of an identity's authorized keys at a point in time. */
interface IdentityVersion {
  createdAt: bigint;
  keys: Set<string>;
}

/** Build a timeline of identity versions from events, sorted by createdAt ascending. */
function buildIdentityTimeline(
  events: { event: v2.Event; content?: v2.Content }[],
): Map<string, IdentityVersion[]> {
  const timelines = new Map<string, IdentityVersion[]>();

  for (const { event, content } of events) {
    if (event.key?.collection !== 1) continue;
    if (!content || content.contentBody.oneofKind !== 'identity') continue;

    const id = content.contentBody.identity;
    const keys = new Set<string>();
    for (const k of id.rotationKeys) keys.add(toHex(k.key));
    for (const k of id.signingKeys) keys.add(toHex(k.key));

    const idKey = event.key.identity;
    if (!timelines.has(idKey)) timelines.set(idKey, []);
    timelines.get(idKey)!.push({ createdAt: event.createdAt, keys });
  }

  // Sort each timeline by createdAt ascending
  for (const versions of timelines.values()) {
    versions.sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    );
  }

  return timelines;
}

/** Check if a signer was authorized at a given time. */
function isAuthorizedAt(
  timelines: Map<string, IdentityVersion[]>,
  identityKey: string,
  signerHex: string,
  eventTime: bigint,
): boolean | undefined {
  const versions = timelines.get(identityKey);
  if (!versions || versions.length === 0) return undefined;

  // Find the latest identity version at or before the event time
  let active: IdentityVersion | null = null;
  for (const v of versions) {
    if (v.createdAt <= eventTime) active = v;
    else break;
  }

  if (!active) return undefined;
  return active.keys.has(signerHex);
}

export const EventList = () => {
  const client = useContext(ClientContext);
  const [events, setEvents] = useState<DecodedEvent[]>([]);

  const loadEvents = async () => {
    if (!client?.core) return;

    const allEvents = await client.storage.events.getAll();

    // First pass: decode all events and content
    const parsed: {
      signedEvent: v2.SignedEvent;
      event: v2.Event;
      content?: v2.Content;
    }[] = [];
    for (const signedEvent of allEvents) {
      try {
        const event = v2.Event.fromBinary(signedEvent.eventBytes);
        let content: v2.Content | undefined;
        if (event.contentDigest?.value) {
          content =
            (await client.storage.content.get(event.contentDigest)) ??
            undefined;
        }
        parsed.push({ signedEvent, event, content });
      } catch (err) {
        console.error(err);
        /* skip */
      }
    }

    // Build identity timeline
    const timelines = buildIdentityTimeline(parsed);

    const decoded: DecodedEvent[] = [];
    for (const { signedEvent, event, content } of parsed) {
      let signatureValid = false;
      try {
        client.core.verify_signed_event(v2.SignedEvent.toBinary(signedEvent));
        signatureValid = true;
      } catch {
        /* failed */
      }

      let identityAuthorized: boolean | undefined;
      const idKey = event.key?.identity;
      const signerKey = event.key?.signedBy?.key;
      if (idKey && signerKey) {
        identityAuthorized = isAuthorizedAt(
          timelines,
          idKey,
          toHex(signerKey),
          event.createdAt,
        );
      }

      decoded.push({
        event,
        content,
        signaturePrefix: Array.from(signedEvent.signature.slice(0, 8))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(''),
        signatureValid,
        identityAuthorized,
        source: 'local',
      });
    }

    setEvents(decoded);
  };

  useEffect(() => {
    loadEvents();
  }, [client]);

  useEffect(() => {
    if (!client) return;
    const handler = () => loadEvents();
    client.events.onContentCreated(handler);
    return () => client.events.offContentCreated(handler);
  }, [client]);

  if (!client) return null;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '24px 0 12px',
        }}
      >
        <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
          Local Events ({events.length})
        </h2>
        <button onClick={loadEvents}>Refresh</button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {events.map((e, i) => (
          <EventCard key={i} e={e} />
        ))}
      </ul>
    </div>
  );
};
