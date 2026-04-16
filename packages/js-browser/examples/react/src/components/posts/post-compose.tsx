import { useContext, useRef } from 'react';
import { ClientContext } from '../../main';

export const PostCompose = () => {
  const client = useContext(ClientContext);
  const postField = useRef<HTMLTextAreaElement | null>(null);

  if (client === null) return null;

  const post = async () => {
    if (!postField.current || !postField.current.value.trim()) return;

    const identity = await client.identityManager.getCurrent();
    if (!identity.identityKey) {
      alert('Create an identity first');
      return;
    }

    const content = await client.contentManager.build({
      oneofKind: 'post',
      post: {
        text: postField.current.value,
      },
    });
    await client.contentManager.save(content);

    const event = await client.buildEvent(content);

    const signedEvent = await client.signEvent(event);
    await client.commitEvent(signedEvent, content);

    postField.current.value = '';
  };

  return (
    <div className="card">
      <textarea ref={postField} placeholder="What's on your mind?" rows={3} />
      <div
        style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}
      >
        <button onClick={post}>Post</button>
      </div>
    </div>
  );
};
