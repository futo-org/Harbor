import { useContext, useEffect, useState } from 'react';
import { ClientContext } from '../../main';
import { v2 } from '@polycentric/js-core';
import type { DecodedEvent } from './event-card';
import { EventCard } from './event-card';

export const EventList = () => {
  const client = useContext(ClientContext);
  const [events, setEvents] = useState<DecodedEvent[]>([]);

  const loadEvents = async () => {
    if (!client?.core) return;

    const allEvents = await client.storage.events.getAllEvents();
    const decoded: DecodedEvent[] = [];

    for (const signedEvent of allEvents) {
      try {
        const event = v2.Event.fromBinary(signedEvent.eventBytes);

        let signatureValid = false;
        try {
          client.core.verify_signed_event(
            v2.SignedEvent.toBinary(signedEvent),
          );
          signatureValid = true;
        } catch {
          // verification failed
        }

        let content: v2.Content | undefined;
        if (event.contentDigest?.value) {
          const contentBytes = await client.storage.content.getContent(
            event.contentDigest.value,
          );
          if (contentBytes) {
            content = v2.Content.fromBinary(contentBytes);
          }
        }

        decoded.push({
          event,
          content,
          signaturePrefix: Array.from(signedEvent.signature.slice(0, 8))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(''),
          signatureValid,
          source: 'local',
        });
      } catch {
        // skip malformed events
      }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '24px 0 12px' }}>
        <h2 style={{ margin: 0, border: 'none', padding: 0 }}>Local Events ({events.length})</h2>
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
