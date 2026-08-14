import { Atoms } from '@/src/common/theme';
import type { ComponentProps } from 'react';

import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import Icon from '@/src/common/components/Icon';
import { View } from 'react-native';
import { NavItem } from './NavItem';

type VerticalNavProps = {
  style?: ComponentProps<typeof View>['style'];
  /** Forwarded to every item; overrides their width-based default. */
  showLabels?: boolean;
};

export function VerticalNav({ style, showLabels }: VerticalNavProps) {
  const { identity } = useCurrentIdentity();

  return (
    <View
      style={[Atoms.py_xs, Atoms.flex_1, Atoms.flex_col, Atoms.gap_sm, style]}
    >
      {identity && (
        <NavItem
          label="Home"
          icon={<Icon name="home" size={24} />}
          href="/feed"
          showLabel={showLabels}
        />
      )}
      <NavItem
        label="Explore"
        icon={<Icon name="searchOutline" size={24} />}
        // Signed out, the explore feed is the homepage.
        href={identity ? '/explore' : '/'}
        showLabel={showLabels}
      />
      {identity && (
        <>
          <NavItem
            label="Notifications"
            icon={<Icon name="notification" size={24} />}
            href="/notifications"
            showLabel={showLabels}
          />

          <NavItem
            label="Verifications"
            icon={<Icon name="verify" size={24} />}
            href="/verifications"
            showLabel={showLabels}
          />

          {identity.identityKey && (
            <NavItem
              label="Profile"
              icon={<Icon name="personOutline" size={24} />}
              href={{
                pathname: '/[identityId]',
                params: { identityId: identity.identityKey },
              }}
              showLabel={showLabels}
            />
          )}

          <NavItem
            label="Settings"
            icon={<Icon name="settings" size={24} />}
            href="/settings"
            showLabel={showLabels}
          />
        </>
      )}
    </View>
  );
}
