import {
  IdentityTag,
  LinkButton,
  ListItem,
  ListItemGroup,
  ProfileAvatar,
  Screen,
  Text,
} from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import Topbar from '@/src/common/components/layout/Topbar';
import { ScrollView } from '@/src/common/components/ScrollView';
import {
  REPORT_BUG_URL,
  Routes,
  SOURCE_CODE_URL,
  TAB_BAR_HEIGHT,
} from '@/src/common/constants';
import { useLinkPreviews } from '@/src/common/link-previews';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { canSelfUpdate, checkForUpdate } from '@/src/features/core/apk-update';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Switch, View } from 'react-native';

function AppearanceSettingRow() {
  const { theme, setActiveThemeName } = useTheme();

  const toggleTheme = () => {
    const next = theme.name === 'dark' ? 'light' : 'dark';
    setActiveThemeName(next);
  };

  return (
    <ListItem onPress={toggleTheme}>
      <View
        style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_md, Atoms.pl_xs]}
      >
        <Icon
          name={theme.name === 'dark' ? 'themeLight' : 'themeDark'}
          size={22}
          color={theme.scheme === 'dark' ? 'neutral_600' : 'primary_600'}
        />
        <Text variant="body">Toggle Theme</Text>
      </View>
    </ListItem>
  );
}

function LinkPreviewSettingRow() {
  const { enabled, setEnabled } = useLinkPreviews();

  return (
    <ListItem onPress={() => setEnabled(!enabled)}>
      <View
        style={[
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.justify_between,
          Atoms.pl_xs,
        ]}
      >
        <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_md]}>
          <Icon name="image" size={22} color="primary_600" />
          <Text variant="body">Generate Link Previews</Text>
        </View>
        <Switch value={enabled} onValueChange={setEnabled} />
      </View>
    </ListItem>
  );
}

export default function SettingsTabScreen() {
  const { identityKey } = useCurrentIdentity();

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_1]}>
          <ScrollView
            HeaderComponent={<Topbar title="Settings" />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[{ paddingBottom: TAB_BAR_HEIGHT + 16 }]}
          >
            <View style={[Atoms.p_lg, Atoms.gap_xl]}>
              <ListItemWrapper
                onPress={() => router.push(Routes.tabs.settings.identity)}
              >
                <>
                  {identityKey && (
                    <CurrentIdentityBadge identityKey={identityKey} />
                  )}
                </>
              </ListItemWrapper>

              <ListItemGroup label="Appearance">
                <AppearanceSettingRow />
              </ListItemGroup>

              <ListItemGroup label="Posting">
                <LinkPreviewSettingRow />
              </ListItemGroup>

              <ListItemGroup label="Identity">
                <ListItemWrapper
                  onPress={() => router.push(Routes.tabs.settings.pairIdentity)}
                >
                  <Text variant="body">Pair Identity</Text>
                </ListItemWrapper>
              </ListItemGroup>

              <ListItemGroup label="Servers">
                <ListItemWrapper
                  onPress={() => router.push(Routes.tabs.settings.servers)}
                >
                  <Text variant="body">Configure servers</Text>
                </ListItemWrapper>
              </ListItemGroup>

              <ListItemGroup label="Content Moderation">
                <ListItemWrapper
                  onPress={() =>
                    router.push(Routes.tabs.settings.moderationSettings)
                  }
                >
                  <Text variant="body">Moderation preferences</Text>
                </ListItemWrapper>
              </ListItemGroup>

              <ListItemGroup>
                <ListItemWrapper
                  onPress={() => Linking.openURL(REPORT_BUG_URL)}
                >
                  <Text variant="body">Report a bug</Text>
                </ListItemWrapper>
              </ListItemGroup>

              <ListItemGroup label="About">
                <VersionRow />
                {canSelfUpdate() ? <CheckForUpdatesRow /> : null}
              </ListItemGroup>

              <SourceCodeItem />
            </View>
          </ScrollView>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}

function CurrentIdentityBadge({ identityKey }: { identityKey: string }) {
  const profile = useProfile(identityKey);

  return (
    <View
      style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_md, { flex: 1 }]}
    >
      <ProfileAvatar identityKey={identityKey} size="md" />
      <View
        style={[
          Atoms.flex_row,
          Atoms.gap_sm,
          { flex: 1, alignItems: 'baseline' },
        ]}
      >
        <Text
          variant="subtitle"
          fontWeight="semibold"
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {profile.name || 'Anonymous'}
        </Text>
        <IdentityTag identity={identityKey} />
      </View>
    </View>
  );
}

function ListItemWrapper({
  children,
  onPress,
}: {
  children: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <ListItem onPress={onPress}>
      <View
        style={[
          Atoms.flex_row,
          Atoms.items_center,
          Atoms.justify_between,
          Atoms.pl_xs,
        ]}
      >
        {children}
        <Icon name="chevronForward" size={18} color="neutral_500" />
      </View>
    </ListItem>
  );
}

function VersionRow() {
  const version = isWeb
    ? Constants.expoConfig?.version
    : Application.nativeApplicationVersion;
  const build = isWeb ? null : Application.nativeBuildVersion;

  return (
    <ListItem pressable={false}>
      <View
        style={[
          Atoms.flex_row,
          Atoms.items_center,
          Atoms.justify_between,
          Atoms.pl_xs,
        ]}
      >
        <Text variant="body">Version</Text>
        <Text variant="body" color="neutral_500">
          {version ?? 'unknown'}
          {build ? ` (${build})` : ''}
        </Text>
      </View>
    </ListItem>
  );
}

function CheckForUpdatesRow() {
  const [checking, setChecking] = useState(false);

  const onPress = async () => {
    if (checking) return;
    setChecking(true);
    try {
      await checkForUpdate({ manual: true });
    } finally {
      setChecking(false);
    }
  };

  return (
    <ListItem onPress={() => void onPress()}>
      <View
        style={[
          Atoms.flex_row,
          Atoms.items_center,
          Atoms.justify_between,
          Atoms.pl_xs,
        ]}
      >
        <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_md]}>
          <Icon name="download" size={22} color="primary_600" />
          <Text variant="body">Check for updates</Text>
        </View>
        {checking ? <ActivityIndicator size="small" /> : null}
      </View>
    </ListItem>
  );
}

function SourceCodeItem() {
  return (
    <View
      style={[Atoms.pt_3xl, Atoms.px_md, Atoms.flex_row, Atoms.items_center]}
    >
      <LinkButton
        title="Source code"
        onPress={() => Linking.openURL(SOURCE_CODE_URL)}
        underlineOnHover
      />
    </View>
  );
}
