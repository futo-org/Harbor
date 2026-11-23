import { ProfileAvatar } from '@/src/common/components/Avatar/ProfileAvatar';
import { useCardLinkPress } from '@/src/common/lib/navigation/useCardLinkPress';
import { Routes } from '@/src/common/constants';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useProfile, type ProfileHookResult } from './hooks/useProfile';
import { IdentityHandle } from './IdentityHandle';
import { Username } from './Username';
import type { FetchMode } from '@polycentric/react-native';
import type { ReactNode } from 'react';
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native';

/**
 * A pressable identity row: avatar, name, and alias/shortened-id subtitle,
 * with an optional trailing element. Runs edge to edge (the hover
 * background spans the full width) with the standard horizontal inset.
 */
export function ProfileRow({
  identity,
  linkToProfile = false,
  onPress,
  trailing,
  size = 'md',
  fetchMode,
  fallbackName,
  disabled,
  activeStyle = 'highlight',
  style,
}: {
  identity: string;
  /**
   * A plain click navigates to the profile, after `onPress`. On web,
   * Cmd/Ctrl-click and middle-click open it in a new tab instead.
   */
  linkToProfile?: boolean;
  onPress?: (identity: string, profile: ProfileHookResult) => void;
  trailing?: ReactNode;
  size?: 'sm' | 'md';
  fetchMode?: FetchMode;
  /** Shown when the profile has no cached name yet. */
  fallbackName?: string | null;
  disabled?: boolean;
  activeStyle?: 'highlight' | 'none';
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const profile = useProfile(identity, { fetchMode });
  const linksToProfile = linkToProfile && !disabled;
  const cardLinkProps = useCardLinkPress(
    linksToProfile ? Routes.tabs.profile(identity) : null,
    onPress && (() => onPress(identity, profile)),
  );
  // On web, the parts are anchors too, for the hover URL and the context
  // menu; on native they'd only take the row's press feedback. Not with
  // `onPress`, which the anchors wouldn't run.
  const linksPartsToProfile = isWeb && linksToProfile && !onPress;

  return (
    <Pressable
      {...cardLinkProps}
      disabled={disabled}
      // iOS folds an accessible view's children into one element, which
      // would hide any control in `trailing` from assistive tech.
      accessible={!trailing}
      style={({ hovered, pressed }) => [
        (hovered || pressed) &&
          activeStyle === 'highlight' &&
          theme.atoms.box.primary.bg_hover,
        disabled && Atoms.faded,
      ]}
    >
      <View
        style={[
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.gap_md,
          Atoms.px_lg,
          size === 'sm' ? Atoms.py_sm : Atoms.py_md,
          style,
        ]}
      >
        <ProfileAvatar
          identityKey={identity}
          size={size}
          linkToProfile={linksPartsToProfile}
        />
        <View style={Atoms.flex_1}>
          <Username
            identity={identity}
            fallbackName={fallbackName}
            variant="secondary"
            fontWeight="semibold"
            selectable={false}
            linkToProfile={linksPartsToProfile}
          />
          <IdentityHandle
            identity={identity}
            variant="small"
            selectable={false}
            linkToProfile={linksPartsToProfile}
          />
        </View>
        {trailing}
      </View>
    </Pressable>
  );
}
