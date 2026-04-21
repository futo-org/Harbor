import { Avatar, Button, Text, TextInput } from '@/src/common/components';
import {
  identiconUrl,
  useCurrentIdentity,
  useProfileEdit,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import {
  DismissReason,
  SheetHeaderBlock,
  SheetMenu,
  type DismissSheet,
} from '@/src/common/lib/sheet';
import { Atoms } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

function EditProfileSheet({
  identityKey,
  dismissSheet,
}: {
  identityKey: string;
  dismissSheet: DismissSheet;
}) {
  const fallbackUsername = useUsername(identityKey);
  const profile = useProfile(identityKey);
  const username = profile.name ?? fallbackUsername;
  const edit = useProfileEdit(username, profile);

  const avatarUrl = identiconUrl(identityKey, 160);

  const handleSave = useCallback(async () => {
    await edit.handleSave();
    await dismissSheet();
  }, [edit, dismissSheet]);

  return (
    <View style={Atoms.flex_1}>
      <SheetHeaderBlock
        title="Edit profile"
        onClose={() => void dismissSheet()}
        closeDisabled={edit.saving}
      />
      <View style={[Atoms.p_lg, Atoms.gap_xl]}>
        <View style={[Atoms.items_center, Atoms.gap_md]}>
          <Avatar source={{ uri: avatarUrl }} size="massive" />
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

        <View style={[Atoms.flex_row, Atoms.gap_sm, Atoms.justify_end]}>
          <Button
            title="Cancel"
            onPress={() => void dismissSheet()}
            variant="tertiary"
            size="sm"
            disabled={edit.saving}
          />
          <Button
            title={edit.saving ? 'Saving...' : 'Save'}
            onPress={handleSave}
            variant="primary"
            size="sm"
            disabled={edit.saving}
          />
        </View>
      </View>
    </View>
  );
}

export default function EditProfileScreen() {
  const { identityKey: selfKey } = useCurrentIdentity();
  const { identityId } = useLocalSearchParams<{ identityId: string }>();

  const identityKey = identityId && identityId === selfKey ? selfKey : null;

  if (!identityKey) return null;

  return (
    <SheetMenu
      onClose={(reason) => {
        if (reason === DismissReason.UserDismissed) router.back();
      }}
      detents={[1]}
      dismissible
      scrollable
    >
      {(dismissSheet) => (
        <EditProfileSheet
          identityKey={identityKey}
          dismissSheet={dismissSheet}
        />
      )}
    </SheetMenu>
  );
}
