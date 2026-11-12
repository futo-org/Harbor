import {
  Button,
  ListItem,
  ListItemGroup,
  Screen,
  ScreenHeader,
  Text,
} from '@/src/common/components';
import { Routes } from '@/src/common/constants';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { Atoms, useTheme } from '@/src/common/theme';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

/** Each browser's store, with the extension's listing once it has one. */
const STORES: { browser: string; store: string; url?: string }[] = [
  { browser: 'Chrome and Brave', store: 'Chrome Web Store' },
  { browser: 'Firefox', store: 'Firefox Add-ons' },
  { browser: 'Edge', store: 'Edge Add-ons' },
  { browser: 'Safari', store: 'App Store' },
];

/** Where to get the browser extension for each browser. */
export default function GetExtensionScreen() {
  usePageTitle('Browser extension');
  const { theme } = useTheme();

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.px_lg, Atoms.flex_1, theme.atoms.bg]}>
          <ScreenHeader
            title="Browser extension"
            onBack={() =>
              router.canGoBack()
                ? router.back()
                : router.replace(Routes.tabs.anywhere.index)
            }
          />
          <ScrollView
            style={Atoms.flex_1}
            contentContainerStyle={[Atoms.gap_xl, Atoms.pb_2xl]}
          >
            <Text color="neutral_500">
              Harbor Anywhere opens Harbor beside the page you are on, to
              comment on it and read what others have said.
            </Text>
            {STORES.map(({ browser, store, url }) => (
              <ListItemGroup key={browser} label={browser}>
                <ListItem pressable={false}>
                  <View
                    style={[
                      Atoms.flex_row,
                      Atoms.align_center,
                      Atoms.justify_between,
                      Atoms.gap_md,
                      Atoms.pl_xs,
                    ]}
                  >
                    <Text>{store}</Text>
                    <Button
                      title={url ? 'Get the extension' : 'Not available yet'}
                      variant={url ? 'primary' : 'tertiary'}
                      size="sm"
                      disabled={!url}
                      onPress={() => window.open(url, '_blank', 'noopener')}
                    />
                  </View>
                </ListItem>
              </ListItemGroup>
            ))}
          </ScrollView>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
