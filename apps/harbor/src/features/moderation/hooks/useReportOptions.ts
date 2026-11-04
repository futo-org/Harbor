import { v2 } from '@polycentric/react-native';

export type ReportOptions = Record<
  string,
  { label: string; value: v2.ReportCategory }
>;

export const REPORT_OPTIONS: ReportOptions = {
  spam: {
    label: 'Spam',
    value: v2.ReportCategory.Spam,
  },
  hate: {
    label: 'Hate',
    value: v2.ReportCategory.Hate,
  },
  violence: {
    label: 'Violence',
    value: v2.ReportCategory.Violence,
  },
  sexuallyExplicit: {
    label: 'Sexually Explicit',
    value: v2.ReportCategory.SexuallyExplicit,
  },
  selfHarm: {
    label: 'Self-Harm',
    value: v2.ReportCategory.SelfHarm,
  },
  childSafety: {
    label: 'Child safety',
    value: v2.ReportCategory.ChildSafety,
  },
  copyright: {
    label: 'Copyright',
    value: v2.ReportCategory.Copyright,
  },
  serverPolicy: {
    label: 'Violates Server Policies',
    value: v2.ReportCategory.ServerPolicy,
  },
};
export default function useReportOptions() {
  return { options: Object.values(REPORT_OPTIONS) };
}
