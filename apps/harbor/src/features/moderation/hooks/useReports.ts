import {
  eventKeyId,
  queryPayload,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { setQueryCache, useQuery } from '@/src/common/query/hooks/useQuery';
import {
  FetchMode,
  Query,
  QueryData,
  QueryData_Tags,
  v2,
} from '@polycentric/react-native';
import { useMemo } from 'react';
import useModerationStatus from './useModerationStatus';

export const REPORTS_PER_SERVER = 50;

export type ServerReport = {
  key: string;
  server: string;
  report: v2.ReportSummary;
};

export interface ReportsState {
  isLoading: boolean;
  reports: ServerReport[];
  truncated: boolean;
  deletePost: (report: ServerReport) => Promise<void>;
  banAuthor: (report: ServerReport) => Promise<void>;
  setStatus: (report: ServerReport, status: v2.ReportStatus) => Promise<void>;
}

/**
 * Reports from every moderated server, one entry per report per server.
 * Each action goes to the server the report came from.
 */
export default function useReports(status: v2.ReportStatus): ReportsState {
  const client = usePolycentric();
  const { moderatedServers: servers, isLoading: serversLoading } =
    useModerationStatus();

  const queryKey = ['list_reports', String(status), ...servers];
  const result = useQuery(
    queryKey,
    new Query.ListReports({ limit: REPORTS_PER_SERVER, status }),
    { fetchMode: FetchMode.Default, servers },
    servers.length > 0,
  );

  const byServer = useMemo(
    () =>
      queryPayload(result.data, QueryData_Tags.ReportsByServer)?.byServer ??
      new Map<string, v2.ListReportsResponse>(),
    [result.data],
  );

  const reports = useMemo(() => {
    const rows: ServerReport[] = [];
    for (const [server, response] of byServer) {
      for (const report of response.reports) {
        rows.push({ key: `${server}|${report.reportId}`, server, report });
      }
    }
    return rows.sort((a, b) =>
      Number(a.report.latestReportedAt - b.report.latestReportedAt),
    );
  }, [byServer]);
  const truncated = [...byServer.values()].some(
    (response) => response.pageInfo?.hasNextPage,
  );

  // Update the cached page so the row moves at once, then drop the
  // rust-side entry so the next fetch re-asks the servers.
  const patchCache = (
    server: string,
    affected: (row: v2.ReportSummary) => boolean,
    newStatus: v2.ReportStatus,
  ) => {
    const keepRow = status === v2.ReportStatus.Unspecified;
    const patched = new Map<string, v2.ListReportsResponse>();
    for (const [s, response] of byServer) {
      let rows = response.reports;
      if (s === server) {
        rows = keepRow
          ? rows.map((row) =>
              affected(row)
                ? {
                    ...row,
                    status: newStatus,
                    resolvedBy: client.activeIdentityKey ?? '',
                    resolvedAt: BigInt(Date.now()),
                  }
                : row,
            )
          : rows.filter((row) => !affected(row));
      }
      patched.set(
        s,
        v2.ListReportsResponse.create({ ...response, reports: rows }),
      );
    }
    setQueryCache(queryKey, {
      data: new QueryData.ReportsByServer({ byServer: patched }),
    });
    void client.invalidateQuery(queryKey);
  };

  const deletePost = async ({ server, report }: ServerReport) => {
    if (!report.target) return;
    const target = report.target;
    const targetId = eventKeyId(target);
    await client.deleteContent(server, target);
    patchCache(
      server,
      (row) =>
        row.target
          ? eventKeyId(row.target) === targetId
          : row.reportId === report.reportId,
      v2.ReportStatus.Resolved,
    );
  };

  const banAuthor = async ({ server, report }: ServerReport) => {
    if (!report.target) return;
    const author = report.target.identity;
    await client.setBanStatus(server, author, true);
    patchCache(
      server,
      (row) => row.target?.identity === author,
      v2.ReportStatus.Resolved,
    );
  };

  const setStatus = async (
    { server, report }: ServerReport,
    newStatus: v2.ReportStatus,
  ) => {
    await client.resolveReport(server, report.reportId, newStatus);
    patchCache(server, (row) => row.reportId === report.reportId, newStatus);
  };

  return {
    isLoading:
      servers.length === 0
        ? serversLoading
        : result.isLoading && result.data === undefined,
    reports,
    truncated,
    deletePost,
    banAuthor,
    setStatus,
  };
}
