import { v2 } from '@polycentric/react-native';

export type ReportOptions = Record<
  string,
  { label: string; value: v2.ReportCategory }
>;

export const REPORT_OPTIONS: ReportOptions = {
  spam: {
    label: 'Spam',
    value: v2.ReportCategory.SPAM,
  },
  abuse: {
    label: 'Abuse',
    value: v2.ReportCategory.ABUSE,
  },
  childSafety: {
    label: 'Child safety',
    value: v2.ReportCategory.CHILD_SAFETY,
  },
  terrorism: {
    label: 'Terrorism',
    value: v2.ReportCategory.TERRORISM,
  },
  illegal: {
    label: 'Illegal',
    value: v2.ReportCategory.ILLEGAL,
  },
  copyright: {
    label: 'Copyright',
    value: v2.ReportCategory.COPYRIGHT,
  },
  serverPolicy: {
    label: 'Violates Server Policies',
    value: v2.ReportCategory.SERVER_POLICY,
  },
};
export default function useReportOptions() {
  return { options: Object.values(REPORT_OPTIONS) };
}
