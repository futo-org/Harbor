import { useContext, useEffect, useState } from 'react';
import { ClientContext } from '../../main';
import { v2 } from '@polycentric/js-core';
import type { DecodedEvent } from './event-card';
import { EventCard } from './event-card';

const fromHex = (hex: string): Uint8Array => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return new Uint8Array(
    clean.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
  );
};

const mono = { fontFamily: 'monospace', fontSize: '0.78rem' };

export const RemoteEventList = () => {
  const client = useContext(ClientContext);
  const [events, setEvents] = useState<DecodedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [identityHex, setIdentityHex] = useState('');
  const [streamId, setStreamId] = useState('');
  const [signedByHex, setSignedByHex] = useState('');

  const fetchRemote = async () => {
    if (!client?.core || client.servers.length === 0) return;

    setLoading(true);
    const allDecoded: DecodedEvent[] = [];

    const identityId = identityHex.trim()
      ? fromHex(identityHex.trim())
      : undefined;
    const sid = streamId.trim() || undefined;
    const signedBy = signedByHex.trim()
      ? fromHex(signedByHex.trim())
      : undefined;

    const results = await Promise.allSettled(
      client.servers.map(async (server) => {
        const responseBytes = await client.core!.list_events(
          server,
          null,
          identityId,
          sid,
          signedBy,
        );
        const response = v2.ListEventsResponse.fromBinary(responseBytes);
        return { server, bundles: response.eventBundles };
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Failed to fetch from server:', result.reason);
        continue;
      }

      const { server, bundles } = result.value;

      for (const bundle of bundles) {
        if (!bundle.signedEvent) continue;

        try {
          const event = v2.Event.fromBinary(bundle.signedEvent.eventBytes);

          let signatureValid = false;
          try {
            client.core!.verify_signed_event(
              v2.SignedEvent.toBinary(bundle.signedEvent),
            );
            signatureValid = true;
          } catch {
            // verification failed
          }

          let content: v2.Content | undefined;
          if (bundle.serializedContent?.contentBytes) {
            try {
              content = v2.Content.fromBinary(
                bundle.serializedContent.contentBytes,
              );
            } catch {
              // content decode failed
            }
          }

          allDecoded.push({
            event,
            content,
            signaturePrefix: [...bundle.signedEvent.signature.slice(0, 8)]
              .map((b: number) => b.toString(16).padStart(2, '0'))
              .join(''),
            signatureValid,
            source: server,
          });
        } catch {
          // skip malformed
        }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '24px 0 12px' }}>
        <h2 style={{ margin: 0, border: 'none', padding: 0 }}>Remote Events ({events.length})</h2>
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: '0.72rem', color: '#484f58', marginBottom: 2 }}>
              Identity (hex)
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
            <div style={{ fontSize: '0.72rem', color: '#484f58', marginBottom: 2 }}>
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
          <div style={{ flex: 0.5, minWidth: 120 }}>
            <div style={{ fontSize: '0.72rem', color: '#484f58', marginBottom: 2 }}>
              Stream ID
            </div>
            <input
              type="text"
              value={streamId}
              onChange={(e) => setStreamId(e.target.value)}
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
