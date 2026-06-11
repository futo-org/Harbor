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
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { router } from 'expo-router';
import { Linking, View } from 'react-native';

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
                  <Text variant="body">Polycentric servers</Text>
                </ListItemWrapper>
              </ListItemGroup>

              <ListItemGroup>
                <ListItemWrapper
                  onPress={() => Linking.openURL(REPORT_BUG_URL)}
                >
                  <Text variant="body">Report a bug</Text>
                </ListItemWrapper>
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
