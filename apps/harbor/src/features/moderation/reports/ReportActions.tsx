import { Button } from '@/src/common/components';
import { confirm } from '@/src/common/lib/dialogs/alert';
import { Atoms, useTheme } from '@/src/common/theme';
import { v2 } from '@polycentric/react-native';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { ServerReport } from '../hooks/useReports';
import { serverHost } from '../serverHost';

export function ReportActions({
  report: entry,
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
  const { server, report } = entry;
  const [pending, setPending] = useState<boolean>(false);
  const host = serverHost(server);

  const run = async (label: string, action: () => Promise<void>) => {
    setPending(true);
    try {
      await action();
    } catch (err) {
      console.error(`Failed to ${label}:`, err);
    } finally {
      setPending(false);
    }
  };

  const confirmed = async (
    title: string,
    message: string,
    confirmText: string,
    action: () => Promise<void>,
  ) => {
    const ok = await confirm({ title, message, confirmText });
    if (!ok) return;
    await run(confirmText.toLowerCase(), action);
  };

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.flex_wrap,
        Atoms.items_center,
        Atoms.gap_sm,
        Atoms.px_md,
        Atoms.pb_md,
      ]}
    >
      {pending ? (
        <ActivityIndicator size="small" color={theme.palette.primary_500} />
      ) : report.status === v2.ReportStatus.OPEN ? (
        <>
          <Button
            size="sm"
            variant="destructive"
            title="Delete post"
            disabled={!report.target}
            onPress={() =>
              void confirmed(
                'Delete Post',
                `Delete this post from ${host}?`,
                'Delete',
                () => deletePost(entry),
              )
            }
          />
          <Button
            size="sm"
            variant="destructive"
            title="Ban user"
            disabled={!report.target}
            onPress={() =>
              void confirmed(
                'Ban User',
                `Ban this user on ${host}? Their posts there are removed.`,
                'Ban',
                () => banAuthor(entry),
              )
            }
          />
          <View style={Atoms.flex_1} />
          <Button
            size="sm"
            variant="tertiary"
            title="Dismiss"
            onPress={() =>
              void run('dismiss', () =>
                setStatus(entry, v2.ReportStatus.DISMISSED),
              )
            }
          />
          <Button
            size="sm"
            variant="tertiary"
            title="Mark as resolved"
            onPress={() =>
              void run('resolve', () =>
                setStatus(entry, v2.ReportStatus.RESOLVED),
              )
            }
          />
        </>
      ) : (
        <>
          <View style={Atoms.flex_1} />
          <Button
            size="sm"
            variant="tertiary"
            title="Reopen"
            onPress={() =>
              void run('reopen', () => setStatus(entry, v2.ReportStatus.OPEN))
            }
          />
        </>
      )}
    </View>
  );
}
