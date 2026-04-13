import { v2 } from '@polycentric/js-core';

export interface DecodedEvent {
  event: v2.Event;
  content?: v2.Content;
  signaturePrefix: string;
  signatureValid: boolean;
  /** Whether the signer is authorized for the claimed identity */
  identityAuthorized?: boolean;
  source?: string;
}

const toHex = (bytes: Uint8Array, len = 8) =>
  Array.from(bytes.slice(0, len))
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('');

const COLLECTION_NAMES: Record<number, string> = {
  1: 'identity',
  2: 'feed',
  3: 'interactions',
};

export const EventCard = ({ e }: { e: DecodedEvent }) => (
  <li
    className="card"
    style={{
      borderLeft: `3px solid ${e.signatureValid && e.identityAuthorized !== false ? '#3fb950' : '#f85149'}`,
    }}
  >
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        gap: 6,
      }}
    >
      <span style={{ color: '#8b949e', fontSize: '0.8rem' }}>
        {e.source ?? 'unknown'}
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        <span
          className={`badge ${e.signatureValid ? 'badge-valid' : 'badge-invalid'}`}
        >
          {e.signatureValid ? 'sig ok' : 'sig fail'}
        </span>
        <span
          className={`badge ${e.identityAuthorized === false ? 'badge-invalid' : e.identityAuthorized === true ? 'badge-valid' : ''}`}
        >
          {e.identityAuthorized === false
            ? 'unauthorized'
            : e.identityAuthorized === true
              ? 'authorized'
              : 'unknown'}
        </span>
      </div>
    </div>

    <ContentDisplay content={e.content} identityKey={e.event.key?.identity} />

    <div
      style={{
        marginTop: 10,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '4px 16px',
        fontSize: '0.78rem',
        color: '#8b949e',
        fontFamily: 'monospace',
      }}
    >
      <div>
        <span style={{ color: '#484f58' }}>collection</span>{' '}
        {COLLECTION_NAMES[e.event.key?.collection ?? 0] ??
          e.event.key?.collection ??
          '-'}
      </div>
      <div>
        <span style={{ color: '#484f58' }}>seq</span>{' '}
        {e.event.key?.sequence?.toString() ?? '-'}
      </div>
      <div>
        <span style={{ color: '#484f58' }}>identity</span>{' '}
        {e.event.key?.identity
          ? e.event.key.identity.slice(0, 12) + '...'
          : '-'}
      </div>
      <div>
        <span style={{ color: '#484f58' }}>key</span>{' '}
        {e.event.key?.signedBy?.key ? toHex(e.event.key.signedBy.key, 6) : '-'}
      </div>
      <div>
        <span style={{ color: '#484f58' }}>sig</span> {e.signaturePrefix}
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

const ContentDisplay = ({
  content,
  identityKey,
}: {
  content?: v2.Content;
  identityKey?: string;
}) => {
  if (!content) {
    return (
      <div style={{ color: '#484f58', fontStyle: 'italic' }}>
        no content available
      </div>
    );
  }

  switch (content.contentBody.oneofKind) {
    case 'post':
      return (
        <div style={{ fontSize: '0.95rem', lineHeight: 1.5 }}>
          {content.contentBody.post.text}
        </div>
      );
    case 'delete':
      return <div style={{ color: '#f85149' }}>[delete]</div>;
    case 'follow':
      return <div style={{ color: '#58a6ff' }}>[follow]</div>;
    case 'block':
      return <div style={{ color: '#f85149' }}>[block]</div>;
    case 'reaction':
      return <div>{content.contentBody.reaction.emoji ?? '[reaction]'}</div>;
    case 'profileUpdate':
      return (
        <div style={{ color: '#d2a8ff' }}>
          [profile: {content.contentBody.profileUpdate.name ?? ''}]
        </div>
      );
    case 'identity': {
      const id = content.contentBody.identity;
      const rotCount = id.rotationKeys.length;
      const sigCount = id.signingKeys.length;
      return (
        <div style={{ color: '#f0883e' }}>
          <div>[identity document]</div>
          <div
            style={{
              fontSize: '0.78rem',
              fontFamily: 'monospace',
              marginTop: 4,
            }}
          >
            {identityKey ? identityKey.slice(0, 16) + '...' : '-'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8b949e', marginTop: 2 }}>
            {rotCount} rotation key{rotCount !== 1 ? 's' : ''}, {sigCount}{' '}
            signing key{sigCount !== 1 ? 's' : ''}
          </div>
        </div>
      );
    }
    default:
      return <div style={{ color: '#484f58' }}>[unknown]</div>;
  }
};
