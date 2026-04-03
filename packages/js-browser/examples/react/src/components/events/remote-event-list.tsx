import { useContext, useEffect, useState } from 'react';
import { ClientContext } from '../../main';
import { v2 } from '@polycentric/js-core';
import type { DecodedEvent } from './event-card';
import { EventCard } from './event-card';

export const RemoteEventList = () => {
  const client = useContext(ClientContext);
  const [events, setEvents] = useState<DecodedEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRemote = async () => {
    if (!client?.core || client.servers.length === 0) return;

    setLoading(true);
    const allDecoded: DecodedEvent[] = [];

    const results = await Promise.allSettled(
      client.servers.map(async (server) => {
        const responseBytes = await client.core!.list_events(server);
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
            signaturePrefix: Array.from(
              bundle.signedEvent.signature.slice(0, 8),
            )
              .map((b) => b.toString(16).padStart(2, '0'))
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
      <h2>Remote Events ({events.length})</h2>
      <button
        onClick={fetchRemote}
        disabled={loading || client.servers.length === 0}
      >
        {loading ? 'Loading...' : 'Refresh'}
      </button>
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
