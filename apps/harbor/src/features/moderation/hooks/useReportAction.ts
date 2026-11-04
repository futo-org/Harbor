import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import {
  COLLECTION,
  parseEventKeyId,
  SyncStrategy,
  v2,
} from '@polycentric/react-native';
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

      const eventKey = parseEventKeyId(eventId);
      if (!eventKey) {
        setPending(false);
        throw new Error(`Invalid event id: ${eventId}`);
      }
      const content = v2.Content.create({
        contentBody: new v2.ContentBody.Report({
          report: v2.Report.create({
            eventKey,
            category,
            additionalInfo,
          }),
        }),
      });

      // Sign and store the report locally.
      await client.publish(content, COLLECTION.REPORTS);

      // Delivery to servers is best-effort — the report is already saved
      // locally and will be pushed on the next sync if this fails.
      try {
        await client.sync(SyncStrategy.PartialPush);
      } catch (e) {
        console.warn('Failed to push report to servers:', e);
      } finally {
        setPending(false);
      }
    },
  };
}
