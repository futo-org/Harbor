import { v2 } from '@polycentric/js-core';

export interface DecodedEvent {
  event: v2.Event;
  content?: v2.Content;
  signaturePrefix: string;
  signatureValid: boolean;
  source?: string;
}

export const EventCard = ({ e }: { e: DecodedEvent }) => (
  <li className="card" style={{ borderLeft: `3px solid ${e.signatureValid ? '#3fb950' : '#f85149'}` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <span style={{ color: '#8b949e', fontSize: '0.8rem' }}>
        {e.source ?? 'unknown'}
      </span>
      <span className={`badge ${e.signatureValid ? 'badge-valid' : 'badge-invalid'}`}>
        {e.signatureValid ? 'verified' : 'invalid sig'}
      </span>
    </div>

    <ContentDisplay content={e.content} />

    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '0.78rem', color: '#8b949e', fontFamily: 'monospace' }}>
      <div>
        <span style={{ color: '#484f58' }}>stream</span>{' '}
        {e.event.key?.streamId || '-'}
      </div>
      <div>
        <span style={{ color: '#484f58' }}>seq</span>{' '}
        {e.event.key?.sequence?.toString() ?? '-'}
      </div>
      <div>
        <span style={{ color: '#484f58' }}>key</span>{' '}
        {e.event.key?.signedBy?.key
          ? Array.from(e.event.key.signedBy.key.slice(0, 6))
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('')
          : '-'}
      </div>
      <div>
        <span style={{ color: '#484f58' }}>sig</span>{' '}
        {e.signaturePrefix}
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <span style={{ color: '#484f58' }}>created</span>{' '}
        {e.event.createdAt
          ? new Date(Number(e.event.createdAt)).toLocaleString()
          : '-'}
      </div>
    </div>
  </li>
);

const ContentDisplay = ({ content }: { content?: v2.Content }) => {
  if (!content) {
    return <div style={{ color: '#484f58', fontStyle: 'italic' }}>no content available</div>;
  }

  switch (content.contentBody.oneofKind) {
    case 'post':
      return <div style={{ fontSize: '0.95rem', lineHeight: 1.5 }}>{content.contentBody.post.text}</div>;
    case 'delete':
      return <div style={{ color: '#f85149' }}>[delete]</div>;
    case 'follow':
      return <div style={{ color: '#58a6ff' }}>[follow]</div>;
    case 'block':
      return <div style={{ color: '#f85149' }}>[block]</div>;
    case 'reaction':
      return <div>{content.contentBody.reaction.emoji ?? '[reaction]'}</div>;
    case 'profileUpdate':
      return <div style={{ color: '#d2a8ff' }}>[profile: {content.contentBody.profileUpdate.name ?? ''}]</div>;
    case 'identity': {
      const id = content.contentBody.identity.id?.value;
      const idHex = id
        ? Array.from(id.slice(0, 12)).map((b) => b.toString(16).padStart(2, '0')).join('')
        : '?';
      return <div style={{ color: '#f0883e' }}>[identity created: {idHex}...]</div>;
    }
    case 'identityIssue': {
      const key = content.contentBody.identityIssue.publicKey?.key;
      const keyHex = key
        ? Array.from(key.slice(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join('')
        : '?';
      return <div style={{ color: '#f0883e' }}>[identity issued to: {keyHex}...]</div>;
    }
    case 'identityRevoke': {
      const key = content.contentBody.identityRevoke.publicKey?.key;
      const keyHex = key
        ? Array.from(key.slice(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join('')
        : '?';
      return <div style={{ color: '#f85149' }}>[identity revoked: {keyHex}...]</div>;
    }
    default:
      return <div style={{ color: '#484f58' }}>[unknown]</div>;
  }
};
