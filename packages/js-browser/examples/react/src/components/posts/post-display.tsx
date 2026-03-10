import type { Post } from '@polycentric/js-core';
import { useContext } from 'react';
import { ClientContext } from '../../main';

export const PostDisplay = ({ post }: { post: Post }) => {
  const client = useContext(ClientContext);

  if (!client) {
    return <div>Client not initialized</div>;
  }

  return (
    <div>
      <div>content: {post.content}</div>
      {/* TODO display images */}
    </div>
  );
};
