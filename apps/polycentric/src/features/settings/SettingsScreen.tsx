import {
  Avatar,
  Button,
  IconButton,
  IdentityBadge,
  LinkButton,
  ListItem,
  ListItemGroup,
  ScreenHeader,
  Screen,
  Text,
  TextInput,
} from '@/src/common/components';
import {
  REPORT_BUG_URL,
  Routes,
  SOURCE_CODE_URL,
  TAB_BAR_HEIGHT,
} from '@/src/common/constants';
import { confirm } from '@/src/common/lib/dialogs/alert';
import {
  identiconUrl,
  publicKeyToString,
  toBase64,
  useCurrentIdentity,
  usePolycentric,
  usePolycentricContext,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import { SheetHeaderBlock, type DismissSheet } from '@/src/common/lib/sheet';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, View } from 'react-native';

function AppearanceSettingRow() {
  const { theme, setActiveThemeName } = useTheme();

  const onPress = () => {
    const next = theme.name === 'dark' ? 'light' : 'dark';
    setActiveThemeName(next);
  };

  return (
    <ListItem onPress={onPress}>
      <View
        style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_md, Atoms.pl_xs]}
      >
        <Ionicons
          name={theme.name === 'dark' ? 'moon' : 'sunny'}
          size={22}
          style={theme.atoms.icon_accent}
        />
        <Text variant="body" style={theme.atoms.text}>
          Theme
        </Text>
      </View>
    </ListItem>
  );
}

export default function SettingsTabScreen() {
  const { identityKey } = useCurrentIdentity();

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.px_lg, Atoms.flex_1]}>
          <ScreenHeader title="Settings" />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              Atoms.gap_xl,
              { paddingBottom: TAB_BAR_HEIGHT + 16 },
            ]}
          >
            <ListItemWrapper
              onPress={() => router.push(Routes.tabs.settings.identity)}
            >
              <>
                {identityKey && (
                  <IdentityBadge identityKey={identityKey} size="lg" />
                )}
              </>
            </ListItemWrapper>

            <ListItemGroup label="Appearance">
              <AppearanceSettingRow />
            </ListItemGroup>

            <ListItemGroup label="Servers">
              <ListItemWrapper
                onPress={() => router.push(Routes.tabs.settings.servers)}
              >
                <Text variant="body">Polycentric servers</Text>
              </ListItemWrapper>
            </ListItemGroup>

            <ListItemGroup>
              <ListItemWrapper onPress={() => Linking.openURL(REPORT_BUG_URL)}>
                <Text variant="body">Report a bug</Text>
              </ListItemWrapper>
            </ListItemGroup>

            <SourceCodeItem />
          </ScrollView>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}

function ListItemWrapper({
  children,
  onPress,
}: {
  children: React.ReactNode;
  onPress: () => void;
}) {
  const { theme } = useTheme();

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
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.palette.neutral_500}
        />
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
