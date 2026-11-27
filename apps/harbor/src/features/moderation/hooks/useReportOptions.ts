import { v2 } from '@polycentric/react-native-sdk';

export type ReportOptions = Record<
  string,
  { label: string; value: v2.ReportCategory }
>;

export const REPORT_OPTIONS: ReportOptions = {
  spam: {
    label: 'Spam',
    value: v2.ReportCategory.SPAM,
  },
  hate: {
    label: 'Hate',
    value: v2.ReportCategory.HATE,
  },
  violence: {
    label: 'Violence',
    value: v2.ReportCategory.VIOLENCE,
  },
  sexuallySuggestive: {
    label: 'Sexually Suggestive',
    value: v2.ReportCategory.SEXUALLY_SUGGESTIVE,
  },
  sexuallyExplicit: {
    label: 'Sexually Explicit',
    value: v2.ReportCategory.SEXUALLY_EXPLICIT,
  },
  selfHarm: {
    label: 'Self-Harm',
    value: v2.ReportCategory.SELF_HARM,
  },
  childSafety: {
    label: 'Child safety',
    value: v2.ReportCategory.CHILD_SAFETY,
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
