import { useContext, useEffect, useState } from 'react';
import { ClientContext } from '../../main';
import { v2 } from '@polycentric/js-core';
import type { DecodedEvent } from './event-card';
import { EventCard } from './event-card';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const fromHex = (hex: string): Uint8Array => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return new Uint8Array(clean.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
};

const mono = { fontFamily: 'monospace', fontSize: '0.78rem' };

export const RemoteEventList = () => {
  const client = useContext(ClientContext);
  const [events, setEvents] = useState<DecodedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [collectionStr, setCollectionStr] = useState('');
  const [identityHex, setIdentityHex] = useState('');
  const [signedByHex, setSignedByHex] = useState('');

  const fetchRemote = async () => {
    if (!client?.core || client.servers.length === 0) return;

    setLoading(true);
    const allDecoded: DecodedEvent[] = [];

    const collection = collectionStr.trim()
      ? Number(collectionStr.trim())
      : undefined;
    const identity = identityHex.trim() || undefined;
    const signedBy = signedByHex.trim()
      ? fromHex(signedByHex.trim())
      : undefined;

    const results = await Promise.allSettled(
      client.servers.map(async (server) => {
        const responseBytes = await client.core!.list_events(
          server,
          null,
          identity,
          collection,
          signedBy,
        );
        const response = v2.ListEventsResponse.fromBinary(responseBytes);
        return { server, bundles: response.eventBundles };
      }),
    );

    // Collect all bundles first, then resolve identity authorization
    const allBundles: { server: string; bundle: v2.EventBundle }[] = [];

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Failed to fetch from server:', result.reason);
        continue;
      }
      const { server, bundles } = result.value;
      for (const bundle of bundles) {
        if (bundle.signedEvent) allBundles.push({ server, bundle });
      }
    }

    // Decode all bundles
    interface IdentityVersion {
      createdAt: bigint;
      keys: Set<string>;
    }
    const timelines = new Map<string, IdentityVersion[]>();
    const referencedIdentities = new Set<string>();

    const parsedBundles: {
      server: string;
      event: v2.Event;
      content?: v2.Content;
      signedEvent: v2.SignedEvent;
    }[] = [];

    for (const { server, bundle } of allBundles) {
      try {
        const event = v2.Event.fromBinary(bundle.signedEvent!.eventBytes);
        let content: v2.Content | undefined;
        if (bundle.serializedContent?.contentBytes) {
          try {
            content = v2.Content.fromBinary(
              bundle.serializedContent.contentBytes,
            );
          } catch (_) {
            /* skip */
          }
        }
        parsedBundles.push({
          server,
          event,
          content,
          signedEvent: bundle.signedEvent!,
        });

        if (event.key?.identity) referencedIdentities.add(event.key.identity);

        // Collect identity versions from results
        if (
          event.key?.collection === 1 &&
          content?.contentBody.oneofKind === 'identity'
        ) {
          const id = content.contentBody.identity;
          const keys = new Set<string>();
          for (const k of id.rotationKeys) keys.add(toHex(k.key));
          for (const k of id.signingKeys) keys.add(toHex(k.key));
          const idKey = event.key.identity;
          if (!timelines.has(idKey)) timelines.set(idKey, []);
          timelines.get(idKey)!.push({ createdAt: event.createdAt, keys });
        }
      } catch (_) {
        /* skip */
      }
    }

    // Fetch identity docs we don't have yet (skip if no filters — all events already fetched)
    const hasFilters =
      collection !== undefined ||
      identity !== undefined ||
      signedBy !== undefined;
    for (const idKey of referencedIdentities) {
      if (timelines.has(idKey) || !hasFilters) continue;
      for (const server of client.servers) {
        try {
          const idBytes = await client.core!.list_events(
            server,
            null,
            idKey,
            1,
          );
          const idResponse = v2.ListEventsResponse.fromBinary(idBytes);
          for (const idBundle of idResponse.eventBundles) {
            if (
              !idBundle.serializedContent?.contentBytes ||
              !idBundle.signedEvent
            )
              continue;
            const ev = v2.Event.fromBinary(idBundle.signedEvent.eventBytes);
            const c = v2.Content.fromBinary(
              idBundle.serializedContent.contentBytes,
            );
            if (c.contentBody.oneofKind !== 'identity') continue;
            const id = c.contentBody.identity;
            const keys = new Set<string>();
            for (const k of id.rotationKeys) keys.add(toHex(k.key));
            for (const k of id.signingKeys) keys.add(toHex(k.key));
            if (!timelines.has(idKey)) timelines.set(idKey, []);
            timelines.get(idKey)!.push({ createdAt: ev.createdAt, keys });
          }
          if (timelines.has(idKey)) break;
        } catch (_) {
          /* try next server */
        }
      }
    }

    // Sort timelines by createdAt ascending
    for (const versions of timelines.values()) {
      versions.sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
      );
    }

    // Build decoded events with time-aware authorization
    for (const { server, event, content, signedEvent } of parsedBundles) {
      try {
        let signatureValid = false;
        try {
          client.core!.verify_signed_event(
            v2.SignedEvent.toBinary(signedEvent),
          );
          signatureValid = true;
        } catch (_) {
          /* failed */
        }

        let identityAuthorized: boolean | undefined;
        const idKey = event.key?.identity;
        const signerKey = event.key?.signedBy?.key;
        if (idKey && signerKey) {
          const versions = timelines.get(idKey);
          if (versions && versions.length > 0) {
            let active: IdentityVersion | null = null;
            for (const v of versions) {
              if (v.createdAt <= event.createdAt) active = v;
              else break;
            }
            if (active) identityAuthorized = active.keys.has(toHex(signerKey));
          }
        }

        allDecoded.push({
          event,
          content,
          signaturePrefix: [...signedEvent.signature.slice(0, 8)]
            .map((b: number) => b.toString(16).padStart(2, '0'))
            .join(''),
          signatureValid,
          identityAuthorized,
          source: server,
        });
      } catch (_) {
        // skip malformed
      }
    }

    setEvents(allDecoded);
    setLoading(false);
  };

  useEffect(() => {
    fetchRemote();
  }, [client?.core, client?.servers.length]);

  if (!client || !client.core) return null;

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
          Remote Events ({events.length})
        </h2>
        <button
          onClick={fetchRemote}
          disabled={loading || client.servers.length === 0}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: '0.78rem', color: '#484f58', marginBottom: 6 }}>
          Filter
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'end',
          }}
        >
          <div style={{ flex: 0.5, minWidth: 120 }}>
            <div
              style={{ fontSize: '0.72rem', color: '#484f58', marginBottom: 2 }}
            >
              Collection (1=identity, 2=feed, 3=interactions)
            </div>
            <input
              type="text"
              value={collectionStr}
              onChange={(e) => setCollectionStr(e.target.value)}
              placeholder="optional"
              style={{ width: '100%', ...mono }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div
              style={{ fontSize: '0.72rem', color: '#484f58', marginBottom: 2 }}
            >
              Identity (hex hash)
            </div>
            <input
              type="text"
              value={identityHex}
              onChange={(e) => setIdentityHex(e.target.value)}
              placeholder="optional"
              style={{ width: '100%', ...mono }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div
              style={{ fontSize: '0.72rem', color: '#484f58', marginBottom: 2 }}
            >
              Signed By (hex)
            </div>
            <input
              type="text"
              value={signedByHex}
              onChange={(e) => setSignedByHex(e.target.value)}
              placeholder="optional"
              style={{ width: '100%', ...mono }}
            />
          </div>
          <button
            onClick={fetchRemote}
            disabled={loading || client.servers.length === 0}
          >
            Apply
          </button>
        </div>
      </div>

      {client.servers.length === 0 && (
        <div style={{ color: '#888', fontSize: '0.85em' }}>
          Add a server to fetch remote events
        </div>
      )}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {events.map((e, i) => (
          <EventCard key={i} e={e} />
        ))}
      </ul>
    </div>
  );
};
