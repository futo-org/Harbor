import { hexToBytes } from '@/src/common/lib/polycentric-hooks';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';
import { usePostById } from '@/src/features/post/hooks/usePostById';
import { types, v2 } from '@polycentric/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ComposeSheet } from './ComposeSheet';

export default function ComposeScreen() {
  const params = useLocalSearchParams<{
    replyTo?: string;
    quote?: string;
    attach?: string;
  }>();

  // Reply
  const replyToEventKey = params.replyTo
    ? v2.EventKey.fromBinary(hexToBytes(params.replyTo))
    : undefined;

  const { post: replyTo } = usePostById(
    replyToEventKey?.identity,
    getKeyFingerprint(replyToEventKey?.signedBy),
    replyToEventKey?.sequence,
  );

  // Quote
  const quoteEventKey = params.quote
    ? v2.EventKey.fromBinary(hexToBytes(params.quote))
    : undefined;

  const { post: quote } = usePostById(
    quoteEventKey?.identity,
    getKeyFingerprint(quoteEventKey?.signedBy),
    quoteEventKey?.sequence,
  );

  const attachOnMount = params.attach === '1';

  const handlePostCreated = useCallback(
    async (_signedEvent: types.SignedEvent) => {
      // TODO: decode sequence from the new v2 SignedEvent and navigate to
      // the created post's route.
    },
    [],
  );

  return (
    <ComposeSheet
      onPostCreated={handlePostCreated}
      replyTo={replyTo}
      quote={quote}
      attachOnMount={attachOnMount}
    />
  );
}
