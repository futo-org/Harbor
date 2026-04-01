import { useContext } from 'react';
import { ClientContext } from '../../main';
import { IdentitySelector } from '../identities/identity-selector';
import { PostCompose } from '../posts/post-compose';
import { EventList } from '../events/event-list';

export const HomePage = () => {
  const client = useContext(ClientContext);

  if (!client) {
    return <div>Error: no client object provided</div>;
  }

  return (
    <div>
      <IdentitySelector />
      <PostCompose />
      <EventList />
    </div>
  );
};
