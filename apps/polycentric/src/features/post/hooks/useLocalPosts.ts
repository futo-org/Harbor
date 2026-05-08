import { useEffect, useRef } from 'react';
import { v2 } from '@polycentric/react-native';
import {
  decodePostBundle,
  type PostData,
} from '../../../common/lib/polycentric-hooks/helpers';
import { usePolycentricContext } from '../../../common/lib/polycentric-hooks/PolycentricProvider';

/**
 * MH: Still not happy with this flow...
 */
export function useLocalPosts(opts: {
  match: (post: PostData) => boolean;
  insert: (post: PostData) => void;
  enabled?: boolean;
}) {
  const { client } = usePolycentricContext();
  const enabled = opts.enabled ?? true;

  const matchRef = useRef(opts.match);
  const insertRef = useRef(opts.insert);
  matchRef.current = opts.match;
  insertRef.current = opts.insert;

  useEffect(() => {
    if (!enabled) return;
    const listener = ({
      signedEvent,
      content,
    }: {
      signedEvent: v2.SignedEvent;
      content?: v2.Content;
    }) => {
      if (!content) return;
      const decoded = decodePostBundle(
        v2.EventBundle.create({
          signedEvent,
          serializedContent: { contentBytes: v2.Content.toBinary(content) },
        }),
      );
      if (!decoded) return;
      if (!matchRef.current(decoded)) return;
      insertRef.current(decoded);
    };
    client.events.onContentCreated(listener);
    return () => client.events.offContentCreated(listener);
  }, [client, enabled]);
}
