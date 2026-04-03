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
      <IdentitySelector />
      <SyncPanel />
      <PostCompose />
      <RemoteEventList />
      <EventList />
    </div>
  );
};
