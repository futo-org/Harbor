import { ListEmpty } from '@/src/common/components/ListEmpty';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { useMemo } from 'react';
import { View } from 'react-native';
import { ExtensionSignIn } from './ExtensionSignIn';
import { ExtensionThread } from './ExtensionThread';
import { ExtensionTopbar } from './ExtensionTopbar';
import { ExtensionUrlFeed } from './ExtensionUrlFeed';
import { useExtensionTab } from './hooks/useExtensionTab';
import { extensionTarget } from './lib/extension-target';

/** What the browser extension frames: Harbor for the page in the tab. */
export default function BrowserExtensionScreen() {
  usePageTitle('Anywhere');
  const { theme } = useTheme();
  const { identity } = useCurrentIdentity();
  const tab = useExtensionTab();
  const target = useMemo(
    () => extensionTarget(tab?.url, tab?.title, tab?.sitePath),
    [tab],
  );

  return (
    <View style={[Atoms.flex_1, theme.atoms.bg]}>
      <ExtensionTopbar />
      {target?.kind === 'post' ? (
        // A thread has its own reply box.
        <ExtensionThread {...target} />
      ) : target ? (
        <ExtensionUrlFeed
          // A draft is for the page it was started on.
          key={target.url}
          url={target.url}
          known={target.title ? tab : undefined}
          canPost={!!identity}
        />
      ) : (
        <ListEmpty>No page in this tab</ListEmpty>
      )}
      {target && !identity ? <ExtensionSignIn tabUrl={tab?.url} /> : null}
    </View>
  );
}
