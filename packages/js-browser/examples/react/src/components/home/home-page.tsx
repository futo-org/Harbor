import { useContext } from 'react';
import { ClientContext } from '../../main';
import { IdentitySelector } from '../identities/identity-selector';
import { PostCompose } from '../posts/post-compose';
import { RemoteEventList } from '../events/remote-event-list';
import { EventList } from '../events/event-list';
import { SyncPanel } from '../sync/sync-panel';

export const HomePage = () => {
  const client = useContext(ClientContext);

  if (!client) {
    return <div>Error: no client object provided</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.4rem', color: '#e6edf3', marginBottom: 4 }}>
        Polycentric
      </h1>
      <p
        style={{
          color: '#484f58',
          fontSize: '0.85rem',
          marginTop: 0,
          marginBottom: 20,
        }}
      >
        v2 protocol demo
      </p>

      <IdentitySelector />
      <SyncPanel />

      <h2>Compose</h2>
      <PostCompose />

      <RemoteEventList />
      <EventList />
    </div>
  );
};
