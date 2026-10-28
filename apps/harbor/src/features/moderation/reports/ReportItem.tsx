import { useTheme, withHexOpacity } from '@/src/common/theme';
import type { v2 } from '@polycentric/react-native';
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
  const { post, isLoading } = useModeratedPost(report.report.target);

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: withHexOpacity(theme.palette.neutral_500, '20'),
      }}
    >
      <ReportHeader report={report} />
      <ModeratedPost post={post} isLoading={isLoading} />
      <ReportActions
        report={report}
        deletePost={deletePost}
        banAuthor={banAuthor}
        setStatus={setStatus}
      />
    </View>
  );
}
