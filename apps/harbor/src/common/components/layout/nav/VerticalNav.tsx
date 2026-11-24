import { Atoms } from '@/src/common/theme';
import type { ComponentProps } from 'react';

import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import Icon from '@/src/common/components/Icon';
import { Routes } from '@/src/common/constants';
import { useFeatureFlag } from '@/src/common/feature-flags';
import { isWeb } from '@/src/common/util/platform';
import useUnreadNotificationCount, {
  unreadNotificationsBadgeLabel,
} from '@/src/features/notifications/hooks/useUnreadNotificationCount';
import { View } from 'react-native';
import { NavItem } from './NavItem';

type VerticalNavProps = {
  style?: ComponentProps<typeof View>['style'];
  /** Forwarded to every item; overrides their width-based default. */
  showLabels?: boolean;
  /** Bigger icons and labels, for the native drawer. */
  large?: boolean;
};

export function VerticalNav({ style, showLabels, large }: VerticalNavProps) {
  const iconSize = large ? 28 : 24;
  const { identity } = useCurrentIdentity();
  const anywhereEnabled = useFeatureFlag('anywhere');
  const unreadNotificationsLabel = unreadNotificationsBadgeLabel(
    useUnreadNotificationCount(),
  );

  return (
    <View
      style={[Atoms.py_xs, Atoms.flex_1, Atoms.flex_col, Atoms.gap_sm, style]}
    >
      {identity && (
        <NavItem
          label="Home"
          icon={<Icon name="home" size={iconSize} />}
          href="/feed"
          showLabel={showLabels}
          large={large}
        />
      )}
      <NavItem
        label="Explore"
        icon={<Icon name="searchOutline" size={iconSize} />}
        // Signed out, the explore feed is the homepage.
        href={identity ? '/explore' : '/'}
        showLabel={showLabels}
        large={large}
      />
      {anywhereEnabled && (
        <NavItem
          label="Anywhere"
          icon={<Icon name="globe" size={iconSize} />}
          href={Routes.tabs.anywhere.index}
          showLabel={showLabels}
          large={large}
        />
      )}
      {identity && (
        <>
          <NavItem
            label="Notifications"
            icon={<Icon name="notification" size={iconSize} />}
            badge={unreadNotificationsLabel}
            href="/notifications"
            showLabel={showLabels}
            large={large}
          />

          <NavItem
            label="Verifications"
            icon={<Icon name="verify" size={iconSize} />}
            href={isWeb ? '/verifications' : '/(tabs)/verifications'}
            showLabel={showLabels}
            large={large}
          />

          {identity.identityKey && (
            <NavItem
              label="Profile"
              icon={<Icon name="personOutline" size={iconSize} />}
              href={{
                pathname: '/[identityId]',
                params: { identityId: identity.identityKey },
              }}
              showLabel={showLabels}
              large={large}
            />
          )}

          <NavItem
            label="Settings"
            icon={<Icon name="settings" size={iconSize} />}
            href="/settings"
            showLabel={showLabels}
            large={large}
          />
        </>
      )}
    </View>
  );
}
