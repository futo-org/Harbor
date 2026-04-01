import { useContext, useEffect, useState } from 'react';
import { ClientContext } from '../../main';
import { v2 } from '@polycentric/js-core';

interface DecodedEvent {
  event: v2.Event;
  content?: v2.Content;
  signaturePrefix: string;
}

export const EventList = () => {
  const client = useContext(ClientContext);
  const [events, setEvents] = useState<DecodedEvent[]>([]);

  const loadEvents = async () => {
    if (!client) return;

    const allEvents = await client.storage.events.getAllEvents();
    const decoded: DecodedEvent[] = [];

    for (const signedEvent of allEvents) {
      try {
        const event = v2.Event.fromBinary(signedEvent.eventBytes);
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
      <h2>Local Events ({events.length})</h2>
      <button onClick={loadEvents}>Refresh</button>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {events.map((e, i) => (
          <li
            key={i}
            style={{
              border: '1px solid #ccc',
              padding: '8px',
              margin: '4px 0',
              fontFamily: 'monospace',
              fontSize: '0.85em',
            }}
          >
            <div>
              <strong>Sequence:</strong> {e.event.key?.sequence?.toString() ?? 'n/a'}
            </div>
            <div>
              <strong>Stream:</strong> {e.event.key?.streamId || 'n/a'}
            </div>
            <div>
              <strong>Signed by:</strong>{' '}
              {e.event.key?.signedBy?.key
                ? Array.from(e.event.key.signedBy.key.slice(0, 8))
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join('') + '...'
                : 'n/a'}
              {' '}(type: {e.event.key?.signedBy?.keyType ?? 'n/a'})
            </div>
            <div>
              <strong>Created:</strong>{' '}
              {e.event.createdAt
                ? new Date(Number(e.event.createdAt)).toLocaleString()
                : 'n/a'}
            </div>
            <div>
              <strong>Content:</strong>{' '}
              <ContentDisplay content={e.content} />
            </div>
            <div>
              <strong>Signature:</strong> {e.signaturePrefix}...
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

const ContentDisplay = ({ content }: { content?: v2.Content }) => {
  if (!content) return <span>no content</span>;

  switch (content.contentBody.oneofKind) {
    case 'post':
      return <span>{content.contentBody.post.text}</span>;
    case 'delete':
      return <span>[delete]</span>;
    case 'follow':
      return <span>[follow]</span>;
    case 'block':
      return <span>[block]</span>;
    case 'reaction':
      return (
        <span>
          [reaction: {content.contentBody.reaction.emoji ?? 'opinion'}]
        </span>
      );
    case 'profileUpdate':
      return (
        <span>
          [profile update: {content.contentBody.profileUpdate.name ?? ''}]
        </span>
      );
    default:
      return <span>[unknown]</span>;
  }
};
