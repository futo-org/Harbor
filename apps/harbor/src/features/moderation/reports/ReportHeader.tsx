import { Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { TimeAgo } from '@/src/common/components/TimeAgo';
import { Atoms } from '@/src/common/theme';
import { Username } from '@/src/features/profile/Username';
import { v2 } from '@polycentric/react-native';
import { View } from 'react-native';
import { REPORT_OPTIONS } from '../hooks/useReportOptions';
import type { ServerReport } from '../hooks/useReports';
import { serverHost } from '../serverHost';
import { ReporterChip } from './ReporterChip';

function categoryName(category: v2.ReportCategory): string {
  return (
    Object.values(REPORT_OPTIONS).find((option) => option.value === category)
      ?.label ?? 'Other'
  );
}

export function ReportHeader({
  report: { server, report },
}: {
  report: ServerReport;
}) {
  const more = report.reportCount - report.reporters.length;

  return (
    <View style={[Atoms.px_md, Atoms.pt_md, Atoms.gap_xs]}>
      <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_sm]}>
        <Text fontWeight="bold">{categoryName(report.category)}</Text>
        <Text variant="small" color="muted">
          {report.reportCount === 1
            ? '1 report'
            : `${report.reportCount} reports`}
          {' · '}
          <TimeAgo since={report.latestReportedAt} />
        </Text>
      </View>
      {report.additionalInfo ? (
        <Text variant="secondary">{report.additionalInfo}</Text>
      ) : null}
      <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_xs]}>
        <Icon name="shieldAccount" size={14} color="neutral_500" />
        <Text variant="small" color="muted">
          Reported on{' '}
        </Text>
        <Text
          variant="small"
          color="secondary"
          fontWeight="semibold"
          monospace
          numberOfLines={1}
          style={Atoms.flex_shrink_1}
        >
          {serverHost(server)}
        </Text>
      </View>
      <View
        style={[
          Atoms.flex_row,
          Atoms.flex_wrap,
          Atoms.items_center,
          Atoms.gap_xs,
        ]}
      >
        <Text variant="small" color="muted">
          Reported by
        </Text>
        {report.reporters.map((reporter) => (
          <ReporterChip key={reporter} identity={reporter} />
        ))}
        {more > 0 ? (
          <Text variant="small" color="muted">
            and {more} more
          </Text>
        ) : null}
      </View>
      {report.status !== v2.ReportStatus.OPEN ? (
        <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_2xs]}>
          <Text variant="small" color="muted">
            {report.status === v2.ReportStatus.RESOLVED
              ? 'Resolved'
              : 'Dismissed'}{' '}
            by{' '}
          </Text>
          <Username
            identity={report.resolvedBy}
            variant="small"
            color="muted"
            fontWeight="semibold"
          />
          <Text variant="small" color="muted">
            {' · '}
            <TimeAgo since={report.resolvedAt} />
          </Text>
        </View>
      ) : null}
    </View>
  );
}
