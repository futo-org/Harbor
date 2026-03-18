import { useContext, useRef } from 'react';
import { ClientContext } from '../../main';

export const PostCompose = () => {
  const client = useContext(ClientContext);
  const postField = useRef<HTMLTextAreaElement | null>(null);

  if (client === null) return <div>Error: No client object provided</div>;

  const post = async () => {
    if (!postField.current) return;

    await client.createPost(postField.current.value);

    postField.current.value = '';
  };

  return (
    <div>
      <textarea ref={postField}></textarea>
      <button onClick={post}>Create Post</button>
    </div>
  );
};
