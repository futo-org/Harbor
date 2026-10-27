import { Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { ScrollView } from '@/src/common/components/ScrollView';
import { Tabs } from '@/src/common/components/tabs';
import { Atoms, useTheme } from '@/src/common/theme';
import { v2 } from '@polycentric/react-native';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import useReports, { REPORTS_PER_SERVER } from '../hooks/useReports';
import { ReportItem } from './ReportItem';

const STATUS_TABS: { label: string; status: v2.ReportStatus }[] = [
  { label: 'Open', status: v2.ReportStatus.OPEN },
  { label: 'Resolved', status: v2.ReportStatus.RESOLVED },
  { label: 'Dismissed', status: v2.ReportStatus.DISMISSED },
  { label: 'All', status: v2.ReportStatus.UNSPECIFIED },
];

export default function ReportsScreen() {
  const { theme } = useTheme();
  const [status, setStatus] = useState<v2.ReportStatus>(v2.ReportStatus.OPEN);
  const {
    isLoading,
    reports,
    truncated,
    deletePost,
    banAuthor,
    setStatus: setReportStatus,
  } = useReports(status);

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_1]}>
          <ScrollView
            HeaderComponent={
              <>
                <Topbar title="Reports" />
                <Tabs>
                  {STATUS_TABS.map((tab) => (
                    <Tabs.Tab
                      key={tab.status}
                      active={status === tab.status}
                      onPress={() => setStatus(tab.status)}
                    >
                      {tab.label}
                    </Tabs.Tab>
                  ))}
                </Tabs>
              </>
            }
            showsVerticalScrollIndicator={false}
          >
            {isLoading ? (
              <View style={[Atoms.items_center, Atoms.p_lg]}>
                <ActivityIndicator
                  size="small"
                  color={theme.palette.primary_500}
                  accessibilityLabel="Loading reports"
                />
              </View>
            ) : reports.length === 0 ? (
              <Text variant="secondary" color="neutral_500" style={Atoms.p_lg}>
                No reports here.
              </Text>
            ) : (
              reports.map((report) => (
                <ReportItem
                  key={report.key}
                  report={report}
                  deletePost={deletePost}
                  banAuthor={banAuthor}
                  setStatus={setReportStatus}
                />
              ))
            )}
            {truncated ? (
              <Text variant="small" color="neutral_500" style={Atoms.p_lg}>
                Showing the oldest {REPORTS_PER_SERVER} reports per server.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
