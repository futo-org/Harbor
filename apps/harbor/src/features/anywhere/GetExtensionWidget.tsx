import { Button, Text } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { Atoms, useTheme } from '@/src/common/theme';
import { usePathname } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { View } from 'react-native';

/** The extension marks Harbor tabs (see its harbor.content.ts). */
const hasExtensionMark = () =>
  'harborBrowserExtension' in document.documentElement.dataset;

/** Watches for the mark, which a reloaded extension adds to open tabs late. */
function watchExtensionMark(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true });
  return () => observer.disconnect();
}

/** Sidebar prompt to get the browser extension, for those without it. */
export function GetExtensionWidget() {
  const { theme } = useTheme();
  const hasExtension = useSyncExternalStore(
    watchExtensionMark,
    hasExtensionMark,
    () => false,
  );
  const onInstaller =
    usePathname() === Routes.tabs.anywhere.browserExtension.index;
  if (hasExtension || onInstaller) return null;

  return (
    <View
      style={[
        // As the other sidebar widgets.
        Atoms.rounded_xl,
        Atoms.p_lg,
        Atoms.w_full,
        Atoms.gap_md,
        { borderWidth: 1, borderColor: theme.palette.neutral_25 },
      ]}
    >
      <View style={Atoms.gap_xs}>
        <Text fontSize="lg" fontWeight="bold">
          Browser extension
        </Text>
        <Text variant="secondary" color="neutral_500">
          Comment on any page on the web, right beside it.
        </Text>
      </View>
      <Button
        title="Get the extension"
        variant="primary"
        size="md"
        style={Atoms.self_start}
        href={Routes.tabs.anywhere.browserExtension.index}
      />
    </View>
  );
}
