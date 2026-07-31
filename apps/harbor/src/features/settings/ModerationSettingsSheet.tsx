import { Text } from '@/src/common/components';
import { SegmentedButton } from '@/src/common/components/SegmentedButton';
import { Sheet } from '@/src/common/components/sheet';
import {
  type ModerationLevel,
  type ModerationPreferences,
  useSettings,
} from '@/src/common/settings';
import { Atoms, useTheme } from '@/src/common/theme';
import { router } from 'expo-router';
import { View } from 'react-native';
import { isWeb } from '@/src/common/util/platform';

type LabelKey = keyof ModerationPreferences;

const LABEL_ENTRIES: {
  key: LabelKey;
  name: string;
  description: string;
}[] = [
  {
    key: 'hate',
    name: 'Hate',
    description: 'Hate speech or incitement against groups',
  },
  {
    key: 'selfHarm',
    name: 'Self-Harm',
    description: 'Self-harm, eating disorders, suicide',
  },
  {
    key: 'sexuallySuggestive',
    name: 'Sexually Suggestive',
    description: 'Innuendo or implied sexual acts',
  },
  {
    key: 'sexuallyExplicit',
    name: 'Sexually Explicit',
    description: 'Pornography or explicit sexual acts',
  },
  {
    key: 'violence',
    name: 'Violence',
    description: 'Violent acts, gore, injury, or terrorism',
  },
];

const LEVELS: { level: ModerationLevel; label: string }[] = [
  { level: 'hide', label: 'Hide' },
  { level: 'warn', label: 'Warn' },
  { level: 'show', label: 'Show' },
];

function ModerationLabelRow({
  labelKey,
  isLast,
}: {
  labelKey: LabelKey;
  isLast?: boolean;
}) {
  const { theme } = useTheme();
  const moderation = useSettings((s) => s.moderation);
  const setModeration = useSettings((s) => s.setModeration);

  const entry = LABEL_ENTRIES.find((e) => e.key === labelKey)!;
  const currentLevel = moderation[labelKey];

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
          onPress: () => setModeration({ [labelKey]: level }),
        }))}
        style={Atoms.ml_sm}
      />
    </View>
  );
}

export default function ModerationSettingsSheet() {
  const labelKeys = LABEL_ENTRIES.map((e) => e.key);
  return (
    <Sheet detents={[0.5, 1]} dismissible>
      <Sheet.Header
        title="Content Moderation"
        onClose={() => router.canGoBack() && router.back()}
      />
      <Sheet.Content style={[Atoms.p_0]}>
        {labelKeys.map((key) => (
          <ModerationLabelRow
            key={key}
            labelKey={key}
            isLast={key === labelKeys[labelKeys.length - 1]}
          />
        ))}
      </Sheet.Content>
    </Sheet>
  );
}
