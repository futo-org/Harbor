import { Button, Text, TextInput } from '@/src/common/components';
import { Sheet } from '@/src/common/components/sheet';
import { ProfileEditAvatar } from '@/src/common/components/Avatar/ProfileEditAvatar';
import {
  useCurrentIdentity,
  useProfileEdit,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { FetchMode } from '@polycentric/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

function EditProfileSheet({ identityKey }: { identityKey: string }) {
  const fallbackUsername = useUsername(identityKey);
  const profile = useProfile(identityKey, { fetchMode: FetchMode.Default });
  const username = profile.name ?? fallbackUsername;
  const edit = useProfileEdit(username, profile);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
  }, []);

  const handleSave = useCallback(async () => {
    await edit.handleSave();
    close();
  }, [edit, close]);

  return (
    <Sheet detents={[1]} dismissible scrollable>
      <Sheet.Header
        title="Edit profile"
        right={
          <View style={[Atoms.flex_row, Atoms.gap_sm, Atoms.justify_end]}>
            <Button
              title={edit.saving ? 'Saving...' : 'Save'}
              onPress={handleSave}
              variant="primary"
              size="sm"
              disabled={edit.saving}
            />
          </View>
        }
        onClose={close}
      />
      <Sheet.Content style={[Atoms.gap_xl]}>
        <View style={[Atoms.items_center, Atoms.gap_md]}>
          <ProfileEditAvatar
            identityKey={identityKey}
            size="massive"
            onSelect={edit.setAvatarUri}
          />
        </View>

        <View style={Atoms.gap_md}>
          <View style={Atoms.gap_xs}>
            <Text variant="small" color="neutral_500">
              DISPLAY NAME
            </Text>
            <TextInput
              value={edit.nameDraft}
              onChangeText={edit.setNameDraft}
              placeholder="Display name"
              autoFocus
            />
          </View>

          <View style={Atoms.gap_xs}>
            <Text variant="small" color="neutral_500">
              BIO
            </Text>
            <TextInput
              value={edit.descriptionDraft}
              onChangeText={edit.setDescriptionDraft}
              placeholder="Bio"
              numberOfLines={3}
            />
          </View>
        </View>
      </Sheet.Content>
    </Sheet>
  );
}

export default function EditProfileScreen() {
  const { identityKey: selfKey } = useCurrentIdentity();
  const { identityId } = useLocalSearchParams<{ identityId: string }>();

  const identityKey = identityId && identityId === selfKey ? selfKey : null;

  if (!identityKey) return null;

  return <EditProfileSheet identityKey={identityKey} />;
}
