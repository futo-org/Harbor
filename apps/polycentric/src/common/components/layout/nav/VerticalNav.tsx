import { Atoms } from '@/src/common/theme';
import { ComponentProps } from 'react';

import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Ionicons } from '@expo/vector-icons';
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
        icon={<Ionicons name="home-outline" size={24} />}
        href="/feed"
      />
      <NavItem
        label="Explore"
        icon={<Ionicons name="search-outline" size={24} />}
        href="/explore"
      />
      {identity?.identityKey && (
        <NavItem
          label="Profile"
          icon={<Ionicons name="person-outline" size={24} />}
          href={{
            pathname: '/[identityId]',
            params: { identityId: identity?.identityKey },
          }}
        />
      )}

      <NavItem
        label="Settings"
        icon={<Ionicons name="settings-outline" size={24} />}
        href="/settings"
      />
    </View>
  );
}
