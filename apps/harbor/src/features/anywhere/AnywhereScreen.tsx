import HARBOR_LOGO from '@/src/common/assets/images/harbor-logo-256.png';
import { Text } from '@/src/common/components';
import { TOPBAR_HEIGHT } from '@/src/common/components/metrics';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

/** Posted to the browser extension once this screen can receive the page. */
const READY_MESSAGE = 'harbor-anywhere:ready';
/** Posted by the browser extension when the active tab's page changes. */
const PAGE_URL_MESSAGE = 'harbor-anywhere:url';

export default function AnywhereScreen() {
  usePageTitle('Anywhere');
  const { theme } = useTheme();
  const { url } = useLocalSearchParams<{ url?: string }>();

  useEffect(() => {
    if (!isWeb || window.parent === window) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      if (event.data?.type !== PAGE_URL_MESSAGE) return;
      router.setParams({ url: event.data.url });
    };
    window.addEventListener('message', onMessage);
    // The extension's origin differs per browser and install.
    window.parent.postMessage({ type: READY_MESSAGE }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <View style={[Atoms.flex_1, theme.atoms.bg]}>
      <View
        style={[
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.gap_sm,
          Atoms.px_md,
          { height: TOPBAR_HEIGHT },
          {
            borderBottomWidth: 1,
            borderBottomColor: withHexOpacity(theme.palette.neutral_500, '10'),
          },
        ]}
      >
        <Image
          source={HARBOR_LOGO}
          contentFit="contain"
          style={{ width: 36, height: 36 }}
        />
        <Text variant="title" fontWeight="bold" numberOfLines={1}>
          Harbor{' '}
          <Text variant="title" fontWeight="regular">
            Anywhere
          </Text>
        </Text>
      </View>
      <View style={Atoms.p_md}>
        <Text variant="body">{url ?? 'No page in this tab'}</Text>
      </View>
    </View>
  );
}
