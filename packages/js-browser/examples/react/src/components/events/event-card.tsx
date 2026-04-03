import { v2 } from '@polycentric/js-core';

export interface DecodedEvent {
  event: v2.Event;
  content?: v2.Content;
  signaturePrefix: string;
  signatureValid: boolean;
  source?: string;
}

export const EventCard = ({ e }: { e: DecodedEvent }) => (
  <li
    style={{
      border: `2px solid ${e.signatureValid ? '#2ea043' : '#da3633'}`,
      padding: '8px',
      margin: '4px 0',
      fontFamily: 'monospace',
      fontSize: '0.85em',
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      {e.source && (
        <span>
          <strong>Source:</strong> {e.source}
        </span>
      )}
      <span
        style={{
          color: e.signatureValid ? '#2ea043' : '#da3633',
          fontWeight: 'bold',
          marginLeft: 'auto',
        }}
      >
        {e.signatureValid ? 'SIG VALID' : 'SIG INVALID'}
      </span>
    </div>
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
    </div>
    <div>
      <strong>Created:</strong>{' '}
      {e.event.createdAt
        ? new Date(Number(e.event.createdAt)).toLocaleString()
        : 'n/a'}
    </div>
    <div>
      <strong>Content:</strong> <ContentDisplay content={e.content} />
    </div>
    <div>
      <strong>Signature:</strong> {e.signaturePrefix}...
    </div>
  </li>
);

const ContentDisplay = ({ content }: { content?: v2.Content }) => {
  if (!content) return <span>no content available</span>;

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
