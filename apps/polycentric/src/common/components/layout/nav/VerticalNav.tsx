import { Atoms, useTheme } from '@/src/common/theme';
import { ComponentProps } from 'react';

import { NavItem } from './NavItem';
import { View } from 'react-native';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Ionicons } from '@expo/vector-icons';

type VerticalNavProps = {
  style?: ComponentProps<typeof View>['style'];
};

export function VerticalNav({ style }: VerticalNavProps) {
  const theme = useTheme();
  const { identity } = useCurrentIdentity();

  return (
    <View
      style={[Atoms.py_xs, Atoms.flex_1, Atoms.flex_col, Atoms.gap_sm, style]}
    >
      <NavItem
        label="Home"
        icon={<Ionicons name="home-outline" size={24} />}
        href="/feed"
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
