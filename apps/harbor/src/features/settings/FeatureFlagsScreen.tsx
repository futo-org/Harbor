import { ListItem, Screen, Text } from '@/src/common/components';
import Topbar from '@/src/common/components/layout/Topbar';
import {
  FEATURE_FLAG_NAMES,
  FEATURE_FLAGS,
  useFeatureFlag,
  type FeatureFlag,
} from '@/src/common/feature-flags';
import { useSettings } from '@/src/common/settings';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { Fragment } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function FeatureFlagSettingRow({ flag }: { flag: FeatureFlag }) {
  const enabled = useFeatureFlag(flag);
  const { label, description } = FEATURE_FLAGS[flag];
  const setFeatureFlag = useSettings((state) => state.setFeatureFlag);
  const toggle = (next: boolean) => setFeatureFlag(flag, next);

  return (
    <ListItem marginHorizontal="lg" onPress={() => toggle(!enabled)}>
      <View
        style={[
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.justify_between,
          Atoms.gap_md,
        ]}
      >
        <View style={[Atoms.flex_1]}>
          <Text variant="body" fontWeight="semibold">
            {label}
          </Text>
          <Text variant="small" fontWeight="regular" color="muted">
            {description}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={toggle}
          testID={`feature-flag-${flag}`}
        />
      </View>
    </ListItem>
  );
}

/** A switch for every feature flag. */
export default function FeatureFlagsScreen() {
  usePageTitle('Feature flags');
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_1, theme.atoms.box.primary.bg]}>
          <Topbar title="Feature flags" />
          {/* The rows run edge to edge; their contents keep the usual inset. */}
          <ScrollView
            style={Atoms.flex_1}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: insets.bottom + Spacing['4xl'],
            }}
          >
            {FEATURE_FLAG_NAMES.map((flag, index) => (
              <Fragment key={flag}>
                {index > 0 && (
                  <View
                    style={[theme.atoms.box.primary.border, Atoms.border_t]}
                  />
                )}
                <FeatureFlagSettingRow flag={flag} />
              </Fragment>
            ))}
          </ScrollView>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
