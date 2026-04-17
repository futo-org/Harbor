import { BackButton } from '@/src/common/components/composites';
import {
  Avatar,
  Button,
  HorizontalScrollGroup,
  Text,
  TextInput,
} from '@/src/common/components/primitives';
import type {
  ProfileEditState,
  ProfileScreenData,
} from '@/src/common/lib/polycentric-hooks';
import { truncateName } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { FeedChip } from '@/src/features/post/FeedChip';
import { memo } from 'react';
import { View } from 'react-native';

const BANNER_HEIGHT = 150;

export interface ProfileHeaderProps {
  data: ProfileScreenData;
  edit: ProfileEditState;
  bannerColors: [string, string];
  onBack: () => void;
}

function ProfileHeaderInner({
  data,
  edit,
  bannerColors,
  onBack,
}: ProfileHeaderProps) {
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

      <View style={[Atoms.mx_lg, { marginTop: -40 }]}>
        <Avatar
          source={data.avatarUrl ? { uri: data.avatarUrl } : undefined}
          size="xl"
        />
      </View>

      <View style={[Atoms.mx_lg, Atoms.mt_md, Atoms.gap_xs]}>
        {edit.editing ? (
          <View style={Atoms.gap_sm}>
            <TextInput
              value={edit.nameDraft}
              onChangeText={edit.setNameDraft}
              placeholder="Display name"
              autoFocus
            />
            <TextInput
              value={edit.descriptionDraft}
              onChangeText={edit.setDescriptionDraft}
              placeholder="Bio"
              numberOfLines={3}
            />
            <View style={[Atoms.flex_row, Atoms.gap_sm]}>
              <Button
                title={edit.saving ? 'Saving...' : 'Save'}
                onPress={edit.handleSave}
                variant="primary"
                size="sm"
              />
              <Button
                title="Cancel"
                onPress={edit.handleCancel}
                variant="tertiary"
                size="sm"
              />
            </View>
          </View>
        ) : (
          <>
            <Text variant="title" fontWeight="bold">
              {truncateName(data.username, 32)}
            </Text>
            <Text variant="secondary" color="neutral_500">
              {data.short}
            </Text>
            {data.profile.description ? (
              <View style={Atoms.mt_sm}>
                <Text variant="body" color="neutral_1000">
                  {data.profile.description}
                </Text>
              </View>
            ) : null}
            {data.isSelf && (
              <View style={Atoms.mt_md}>
                <Button
                  title="Edit"
                  onPress={() => edit.setEditing(true)}
                  variant="tertiary"
                  size="sm"
                />
              </View>
            )}
          </>
        )}
      </View>

      {!data.isSelf && (
        <View style={[Atoms.mx_lg, Atoms.mt_md]}>
          <Button
            title={data.followStatus.isFollowing ? 'Following' : 'Follow'}
            variant={data.followStatus.isFollowing ? 'secondary' : 'primary'}
            size="sm"
            onPress={data.followStatus.toggleFollow}
          />
        </View>
      )}

      <View style={[Atoms.mx_lg, Atoms.mt_lg, Atoms.mb_md]}>
        <HorizontalScrollGroup>
          <FeedChip
            type="posts"
            title="Posts"
            isSelected={data.activeFeed === 'posts'}
            onPress={() => data.setActiveFeed('posts')}
          />
          {data.isSelf && (
            <FeedChip
              type="likes"
              title="Likes"
              isSelected={data.activeFeed === 'likes'}
              onPress={() => data.setActiveFeed('likes')}
            />
          )}
        </HorizontalScrollGroup>
      </View>
    </>
  );
}

export const ProfileHeader = memo(ProfileHeaderInner);
