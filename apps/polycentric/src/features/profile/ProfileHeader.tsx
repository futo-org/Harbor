import { BackButton } from '@/src/common/components/composites';
import Icon from '@/src/common/components/Icon';
import { useImageViewer } from '@/src/common/components/ImageViewer';
import {
  Button,
  ProfileAvatar,
  Text,
} from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import {
  identiconUrl,
  shortenIdentityId,
  truncateName,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { FetchMode } from '@polycentric/react-native';
import { Portal } from '@rn-primitives/portal';
import { router } from 'expo-router';
import { memo, useCallback, useId, useRef, useState } from 'react';
import { Dimensions, Pressable, View } from 'react-native';
import FollowButton from '../follow/FollowButton';
import { useProfileContext } from './ProfileContext';

const BANNER_HEIGHT = 150;

export interface ProfileHeaderProps {
  bannerColors: [string, string];
  onBack: () => void;
}

function ProfileHeaderInner({ bannerColors, onBack }: ProfileHeaderProps) {
  const { theme } = useTheme();
  const { identityKey, isSelf, activeFeed, setActiveFeed, webfingerAlias } =
    useProfileContext();

  const fallbackUsername = useUsername(identityKey);
  const profile = useProfile(identityKey, { fetchMode: FetchMode.Default });

  const username = profile.name ?? fallbackUsername;

  const short = identityKey ? shortenIdentityId(identityKey) : '...';

  const handleEdit = useCallback(() => {
    if (identityKey) router.push(Routes.tabs.editProfile(identityKey));
  }, [identityKey]);

  const openImageViewer = useImageViewer();
  const avatar = profile.avatar;
  const handleAvatarPress = useCallback(() => {
    if (!identityKey) return;
    openImageViewer([
      avatar ?? { uri: identiconUrl(identityKey, 512), aspectRatio: 1 },
    ]);
  }, [avatar, identityKey, openImageViewer]);

  if (profile.isLoading && !profile.name) return undefined;

  return (
    <View style={{ backgroundColor: theme.palette.neutral_0 }}>
      <View style={{ position: 'relative' }}>
        <View
          style={{
            height: BANNER_HEIGHT,
            backgroundColor: bannerColors[1],
            overflow: 'hidden',
          }}
        >
          <View
            style={[
              Atoms.absolute,
              {
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: bannerColors[0],
                opacity: 0.5,
              },
            ]}
          />
        </View>
        <View
          style={[
            Atoms.absolute,
            { top: 0, left: 0 },
            Atoms.mx_lg,
            Atoms.mt_md,
          ]}
        >
          <BackButton onPress={onBack} />
        </View>
      </View>

      <View style={[Atoms.mx_lg, { marginTop: -56 }]}>
        {identityKey ? (
          <ProfileAvatar
            identityKey={identityKey}
            size="xl"
            onPress={handleAvatarPress}
          />
        ) : null}
      </View>

      <View
        style={[
          Atoms.mx_lg,
          Atoms.pb_lg,
          Atoms.flex_row,
          Atoms.justify_between,
          Atoms.gap_md,
        ]}
      >
        {/* Flexible, shrinkable column: `minWidth: 0` lets a long unbreakable
            alias truncate instead of forcing the row wider and pushing the
            action button off-screen. */}
        <View
          style={[Atoms.mt_md, Atoms.gap_xs, Atoms.flex_1, { minWidth: 0 }]}
        >
          <Text variant="title" fontWeight="bold">
            {truncateName(username, 32)}
          </Text>
          <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_xs]}>
            <Icon name="key" size={13} color="neutral_500" />
            <Text variant="secondary" color="neutral_500">
              {short}
            </Text>
          </View>
          {webfingerAlias ? (
            <WebfingerAliasLabel alias={webfingerAlias} />
          ) : null}
          {profile.description ? (
            <View style={Atoms.mt_sm}>
              <Text variant="body" fontSize="sm" color="neutral_1000">
                {profile.description}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[Atoms.mt_md, { flexShrink: 0 }]}>
          {isSelf ? (
            <Button
              title="Edit profile"
              onPress={handleEdit}
              variant="tertiary"
              size="sm"
            />
          ) : (
            <FollowButton identity={identityKey!} />
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * The verified WebFinger alias, truncated to one line so it can't push the
 * action button off-screen. Hovering (web) or tapping (native) reveals the
 * full alias in a bubble.
 */
const ALIAS_BUBBLE_WIDTH = 320;
const EDGE_MARGIN = 8;

function WebfingerAliasLabel({ alias }: { alias: string }) {
  const { theme } = useTheme();
  const portalName = `alias-tooltip-${useId()}`;
  const triggerRef = useRef<View>(null);
  const [revealed, setRevealed] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, h: 0 });

  const show = () => {
    if (isWeb && triggerRef.current) {
      triggerRef.current.measureInWindow((x, y, _w, h) => {
        setAnchor({ x, y, h });
        setRevealed(true);
      });
    } else {
      setRevealed(true);
    }
  };
  const hide = () => setRevealed(false);

  const bubbleStyle = [
    Atoms.p_sm,
    {
      maxWidth: ALIAS_BUBBLE_WIDTH,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.palette.neutral_300,
      backgroundColor: theme.palette.background_secondary,
    },
  ] as const;

  const bubbleBody = (
    <Text variant="secondary" color="neutral_900">
      {alias}
    </Text>
  );

  return (
    <View ref={triggerRef} collapsable={false} style={{ position: 'relative' }}>
      <Pressable
        onHoverIn={show}
        onHoverOut={hide}
        onPress={() => (revealed ? hide() : show())}
        accessibilityRole="button"
        accessibilityLabel={alias}
        style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_xs]}
      >
        <Icon name="at" size={13} color="neutral_500" />
        <Text
          variant="secondary"
          color="neutral_500"
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {alias}
        </Text>
      </Pressable>

      {/* Web: portal to the app root so the bubble escapes the feed list's
          stacking/clipping and paints opaquely over the page. */}
      {revealed && isWeb ? (
        <Portal name={portalName}>
          <View
            style={[
              bubbleStyle,
              {
                position: 'fixed' as 'absolute',
                top: anchor.y + anchor.h + 4,
                left: Math.max(
                  EDGE_MARGIN,
                  Math.min(
                    anchor.x,
                    Dimensions.get('window').width -
                      ALIAS_BUBBLE_WIDTH -
                      EDGE_MARGIN,
                  ),
                ),
                width: ALIAS_BUBBLE_WIDTH,
                zIndex: 10000,
              },
            ]}
          >
            {bubbleBody}
          </View>
        </Portal>
      ) : null}

      {revealed && !isWeb ? (
        <View
          style={[
            bubbleStyle,
            {
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              zIndex: 1000,
              elevation: 8,
            },
          ]}
        >
          {bubbleBody}
        </View>
      ) : null}
    </View>
  );
}

export const ProfileHeader = memo(ProfileHeaderInner);
