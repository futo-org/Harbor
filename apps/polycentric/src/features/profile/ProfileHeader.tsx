import { BackButton } from '@/src/common/components/composites';
import {
  Button,
  HorizontalScrollGroup,
  ProfileAvatar,
  Text,
} from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import {
  shortenIdentityId,
  truncateName,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { FeedChip } from '@/src/features/post/FeedChip';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { FetchMode } from '@polycentric/react-native';
import { router, useFocusEffect } from 'expo-router';
import { memo, useCallback } from 'react';
import { View } from 'react-native';
import { useProfileContext } from './ProfileContext';
import FollowButton from '../follow/FollowButton';

const BANNER_HEIGHT = 150;

export interface ProfileHeaderProps {
  bannerColors: [string, string];
  onBack: () => void;
}

function ProfileHeaderInner({ bannerColors, onBack }: ProfileHeaderProps) {
  const { identityKey, isSelf, activeFeed, setActiveFeed } =
    useProfileContext();

  const fallbackUsername = useUsername(identityKey);
  const profile = useProfile(identityKey, { fetchMode: FetchMode.Default });
  const username = profile.name ?? fallbackUsername;

  const short = identityKey ? shortenIdentityId(identityKey) : '...';

  const handleEdit = useCallback(() => {
    if (identityKey) router.push(Routes.tabs.editProfile(identityKey));
  }, [identityKey]);

  return (
    <>
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
          <ProfileAvatar identityKey={identityKey} size="xl" />
        ) : null}
      </View>

      <View
        style={[
          Atoms.mx_lg,
          Atoms.pb_lg,
          Atoms.flex_row,
          Atoms.justify_between,
        ]}
      >
        <View style={[Atoms.mt_md, Atoms.gap_xs]}>
          <Text variant="title" fontWeight="bold">
            {truncateName(username, 32)}
          </Text>
          <Text variant="secondary" color="neutral_500">
            {short}
          </Text>
          {profile.description ? (
            <View style={Atoms.mt_sm}>
              <Text variant="body" fontSize="sm" color="neutral_1000">
                {profile.description}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={Atoms.mt_md}>
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
    </>
  );
}

export const ProfileHeader = memo(ProfileHeaderInner);
