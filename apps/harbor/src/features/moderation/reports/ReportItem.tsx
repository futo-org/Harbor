import { useTheme, withHexOpacity } from '@/src/common/theme';
import { ProfileRow } from '@/src/features/profile/ProfileRow';
import { COLLECTION, FetchMode, type v2 } from '@polycentric/react-native';
import { View } from 'react-native';
import type { ServerReport } from '../hooks/useReports';
import { ModeratedPost, useModeratedPost } from '../ModeratedPost';
import { ReportActions } from './ReportActions';
import { ReportHeader } from './ReportHeader';

export function ReportItem({
  report,
  deletePost,
  banAuthor,
  setStatus,
}: {
  report: ServerReport;
  deletePost: (report: ServerReport) => Promise<void>;
  banAuthor: (report: ServerReport) => Promise<void>;
  setStatus: (report: ServerReport, status: v2.ReportStatus) => Promise<void>;
}) {
  const { theme } = useTheme();
  const target = report.report.target;
  // A report on an identity event is a report on the identity.
  const identity =
    target?.collection === COLLECTION.IDENTITY ? target.identity : null;
  const { post, isLoading } = useModeratedPost(identity ? undefined : target);

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: withHexOpacity(theme.palette.neutral_500, '20'),
      }}
    >
      <ReportHeader report={report} />
      {identity ? (
        <ProfileRow identity={identity} fetchMode={FetchMode.Default} />
      ) : (
        <ModeratedPost post={post} isLoading={isLoading} />
      )}
      <ReportActions
        report={report}
        deletePost={deletePost}
        banAuthor={banAuthor}
        setStatus={setStatus}
      />
    </View>
  );
}
