import { hexToBytes, usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { COLLECTION, v2, SyncStrategy } from '@polycentric/react-native';
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

      await client.createEvent({ collection: COLLECTION.REPORTS, content });

      // Delivery to servers is best-effort — the report is already saved
      // locally and will be pushed on the next sync if this fails.
      try {
        await client.sync(SyncStrategy.PARTIAL_PUSH);
      } catch (e) {
        console.warn('Failed to push report to servers:', e);
      } finally {
        setPending(false);
      }
    },
  };
}
