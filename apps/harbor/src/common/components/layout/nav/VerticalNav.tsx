import { Atoms } from '@/src/common/theme';
import type { ComponentProps } from 'react';

import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import Icon from '@/src/common/components/Icon';
import { View } from 'react-native';
import { NavItem } from './NavItem';

type VerticalNavProps = {
  style?: ComponentProps<typeof View>['style'];
};

export function VerticalNav({ style }: VerticalNavProps) {
  const { identity } = useCurrentIdentity();

  if (!identity) {
    return null;
  }

  return (
    <View
      style={[Atoms.py_xs, Atoms.flex_1, Atoms.flex_col, Atoms.gap_sm, style]}
    >
      <NavItem
        label="Home"
        icon={<Icon name="home" size={24} />}
        href="/feed"
      />
      <NavItem
        label="Explore"
        icon={<Icon name="searchOutline" size={24} />}
        href="/explore"
      />
      <NavItem
        label="Notifications"
        icon={<Icon name="notification" size={24} />}
        href="/notifications"
      />

      <NavItem
        label="Verifications"
        icon={<Icon name="verify" size={24} />}
        href="/verifications"
      />

      {identity?.identityKey && (
        <NavItem
          label="Profile"
          icon={<Icon name="personOutline" size={24} />}
          href={{
            pathname: '/[identityId]',
            params: { identityId: identity?.identityKey },
          }}
        />
      )}

      <NavItem
        label="Settings"
        icon={<Icon name="settings" size={24} />}
        href="/settings"
      />
    </View>
  );
}
