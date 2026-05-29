import { hexToBytes, usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { COLLECTION, v2 } from '@polycentric/react-native';

export default function useReportAction() {
  const client = usePolycentric();
  return {
    submit: async ({
      eventId,
      category,
      additionalInfo,
    }: {
      eventId: string;
      category: v2.ReportCategory;
      additionalInfo: string;
    }) => {
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
      const event = await client.buildEvent(content, COLLECTION.REPORTS);
      const signedEvent = await client.signEvent(event);

      try {
        await client.commitEvent(signedEvent);
        await client.push();
      } catch (e) {
        // Do we care if these fail?
      }
    },
  };
}
