import { IconButton, Screen, Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import Topbar from '@/src/common/components/layout/Topbar';
import { Tabs } from '@/src/common/components/tabs';
import { confirm } from '@/src/common/lib/dialogs/alert';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { Atoms, type PaletteColorToken, useTheme } from '@/src/common/theme';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type LogEntry,
  type LogLevel,
  clearLogs,
  useLogStore,
} from './hooks/useLogStore';
import { shareLogs } from './utils/share-logs';

type Filter = 'all' | 'warn' | 'error';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'warn', label: 'Warnings' },
  { key: 'error', label: 'Errors' },
];

const DOT_COLOR: Partial<Record<LogLevel, PaletteColorToken>> = {
  warn: 'warning_500',
  error: 'negative_500',
};

const FONT_SIZE = 12;
const LINE_HEIGHT = 17;
const COLLAPSED_LINES = 2;
const DOT_SIZE = 8;

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

function formatRowTime(at: number): string {
  const d = new Date(at);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? time
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`;
}

function LogRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: LogEntry;
  expanded: boolean;
  onToggle: (id: number) => void;
}) {
  const { theme } = useTheme();
  const dot = DOT_COLOR[entry.level];

  return (
    <Pressable
      onPress={() => onToggle(entry.id)}
      style={[Atoms.flex_row, Atoms.gap_sm, Atoms.px_md, Atoms.py_sm]}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
    >
      <View
        style={{
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: DOT_SIZE / 2,
          marginTop: (LINE_HEIGHT - DOT_SIZE) / 2,
          backgroundColor: dot ? theme.palette[dot] : 'transparent',
        }}
      />
      <View style={[Atoms.flex_1, Atoms.gap_xs]}>
        <Text
          monospace
          fontSize={FONT_SIZE}
          lineHeight={LINE_HEIGHT}
          numberOfLines={expanded ? undefined : COLLAPSED_LINES}
          selectable={expanded}
        >
          {entry.message}
        </Text>
        <Text
          fontSize={11}
          lineHeight={14}
          fontWeight="regular"
          color="neutral_400"
        >
          {formatRowTime(entry.at)}
        </Text>
        {expanded ? (
          <Text
            monospace
            fontSize={FONT_SIZE}
            lineHeight={LINE_HEIGHT}
            color="neutral_600"
            selectable
            style={[
              Atoms.p_sm,
              Atoms.rounded_sm,
              Atoms.mt_xs,
              { backgroundColor: theme.palette.neutral_50 },
            ]}
          >
            {JSON.stringify(entry.record, null, 2)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function LogsScreen() {
  usePageTitle('Logs');
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const entries = useLogStore((state) => state.entries);
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );

  const toggleExpanded = useCallback((id: number) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const visible = useMemo(() => {
    const matching =
      filter === 'all'
        ? entries
        : entries.filter((entry) =>
            filter === 'error'
              ? entry.level === 'error'
              : entry.level === 'warn' || entry.level === 'error',
          );
    return [...matching].reverse();
  }, [entries, filter]);

  const onClear = async () => {
    const ok = await confirm({
      title: 'Clear logs',
      message: 'Remove all logs stored on this device?',
      confirmText: 'Clear',
    });
    if (ok) clearLogs();
  };

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_1, theme.atoms.bg]}>
          <Topbar
            title="Logs"
            right={
              <View style={[Atoms.flex_row, Atoms.gap_xs]}>
                <IconButton
                  size="sm"
                  variant="ghost"
                  accessibilityLabel="Clear logs"
                  icon={(props) => <Icon name="trash" {...props} />}
                  disabled={entries.length === 0}
                  onPress={() => void onClear()}
                />
                <IconButton
                  size="sm"
                  variant="ghost"
                  accessibilityLabel="Share logs"
                  icon={(props) => <Icon name="share" {...props} />}
                  disabled={entries.length === 0}
                  onPress={() => void shareLogs(entries)}
                />
              </View>
            }
          />
          <Tabs>
            {FILTERS.map(({ key, label }) => (
              <Tabs.Tab
                key={key}
                active={filter === key}
                onPress={() => setFilter(key)}
              >
                {label}
              </Tabs.Tab>
            ))}
          </Tabs>
          <FlatList
            style={Atoms.flex_1}
            data={visible}
            keyExtractor={(entry) => String(entry.id)}
            renderItem={({ item }) => (
              <LogRow
                entry={item}
                expanded={expandedIds.has(item.id)}
                onToggle={toggleExpanded}
              />
            )}
            ItemSeparatorComponent={() => (
              <View
                style={[theme.atoms.border_neutral_low, { borderTopWidth: 1 }]}
              />
            )}
            extraData={expandedIds}
            showsVerticalScrollIndicator={false}
            initialNumToRender={40}
            contentContainerStyle={[
              Atoms.py_xs,
              Atoms.flex_grow_1,
              { paddingBottom: insets.bottom + 16 },
            ]}
            ListEmptyComponent={
              <View
                style={[
                  Atoms.flex_1,
                  Atoms.align_center,
                  Atoms.justify_center,
                  Atoms.p_xl,
                ]}
              >
                <Text variant="secondary" color="neutral_500">
                  {entries.length === 0
                    ? 'No logs recorded yet.'
                    : 'No matching logs.'}
                </Text>
              </View>
            }
          />
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
