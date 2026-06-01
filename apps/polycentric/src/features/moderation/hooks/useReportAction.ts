import { hexToBytes, usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { COLLECTION, v2 } from '@polycentric/react-native';
import { useState } from 'react';

export default function useReportAction() {
  const client = usePolycentric();

  const [isPending, setPending] = useState<boolean>(false);

  return {
    isPending,
    submit: async ({
      eventId,
      category,
      additionalInfo,
    }: {
      eventId: string;
      category: v2.ReportCategory;
      additionalInfo: string;
    }) => {
      if (isPending) {
        throw 'Already pending';
      }
      setPending(true);

      const eventKey = v2.EventKey.fromBinary(hexToBytes(eventId));
      const content = v2.Content.create({
        contentBody: {
          oneofKind: 'report',
          report: {
            eventKey,
            category,
            additionalInfo,
          },
        },
      });

      // Persist the content first: the event references it by digest, and
      // `push()` looks the content up from the local store to attach it.
      await client.contentManager.save(content);

      const event = await client.buildEvent(content, COLLECTION.REPORTS);
      const signedEvent = await client.signEvent(event);

      // Save the event locally and mirror it (with content) into the core.
      await client.commitEvent(signedEvent, content);

      // Delivery to servers is best-effort — the report is already saved
      // locally and will be pushed on the next sync if this fails.
      try {
        await client.push();
      } catch (e) {
        console.warn('Failed to push report to servers:', e);
      } finally {
        setPending(false);
      }
    },
  };
}
