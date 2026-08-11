import { Text } from '@/src/common/components';
import { SegmentedButton } from '@/src/common/components/SegmentedButton';
import { Sheet } from '@/src/common/components/sheet';
import {
  MODERATION_LABEL_ENTRIES,
  type ModerationLabelEntry,
  type ModerationLevel,
  useSettings,
} from '@/src/common/settings';
import { Atoms, useTheme } from '@/src/common/theme';
import { router } from 'expo-router';
import { View } from 'react-native';
import { isWeb } from '@/src/common/util/platform';

const LEVELS: { level: ModerationLevel; label: string }[] = [
  { level: 'hide', label: 'Hide' },
  { level: 'warn', label: 'Warn' },
  { level: 'show', label: 'Show' },
];

function ModerationLabelRow({
  entry,
  isLast,
}: {
  entry: ModerationLabelEntry;
  isLast?: boolean;
}) {
  const { theme } = useTheme();
  const moderation = useSettings((s) => s.moderation);
  const setModeration = useSettings((s) => s.setModeration);

  const currentLevel = moderation[entry.key];

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.items_center,
        Atoms.justify_between,
        isWeb ? undefined : Atoms.gap_xs,
        Atoms.py_md,
        Atoms.px_lg,
        {
          borderBottomWidth: isLast ? 0 : 1,
          borderColor: theme.palette.neutral_25,
        },
      ]}
    >
      <View style={[Atoms.flex_col, Atoms.flex_1]}>
        <Text
          variant="secondary"
          fontWeight="semibold"
          style={theme.atoms.text}
        >
          {entry.name}
        </Text>
        <Text
          variant="small"
          fontWeight="regular"
          style={theme.atoms.text_neutral_medium}
        >
          {entry.description}
        </Text>
      </View>
      <SegmentedButton
        segments={LEVELS.map(({ level, label }) => ({
          label,
          active: currentLevel === level,
          onPress: () => setModeration({ [entry.key]: level }),
        }))}
        style={Atoms.ml_sm}
      />
    </View>
  );
}

export default function ModerationSettingsSheet() {
  return (
    <Sheet detents={[0.5, 1]} dismissible>
      <Sheet.Header
        title="Content Moderation"
        onClose={() => router.canGoBack() && router.back()}
      />
      <Sheet.Content style={[Atoms.p_0]}>
        {MODERATION_LABEL_ENTRIES.map((entry, index) => (
          <ModerationLabelRow
            key={entry.key}
            entry={entry}
            isLast={index === MODERATION_LABEL_ENTRIES.length - 1}
          />
        ))}
      </Sheet.Content>
    </Sheet>
  );
}
