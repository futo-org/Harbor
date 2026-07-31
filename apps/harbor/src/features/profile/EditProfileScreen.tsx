import { Button, Text, TextInput } from '@/src/common/components';
import { InfoTooltip } from '@/src/common/components/InfoTooltip';
import { Sheet } from '@/src/common/components/sheet';
import { ProfileEditAvatar } from '@/src/common/components/Avatar/ProfileEditAvatar';
import {
  useCurrentIdentity,
  useProfileEdit,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, ZIndex } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { FetchMode } from '@polycentric/react-native';
import { Link, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

function EditProfileSheet({ identityKey }: { identityKey: string }) {
  const fallbackUsername = useUsername(identityKey);
  const profile = useProfile(identityKey, { fetchMode: FetchMode.Default });
  const username = profile.name ?? fallbackUsername;
  const edit = useProfileEdit(username, profile, identityKey);
  const navigation = useNavigation();

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
  }, []);

  const handleSave = useCallback(async () => {
    // Keep the sheet open on a rejected save (e.g. alias failed verification)
    // so the error stays visible.
    if (!(await edit.handleSave())) return;
    // The user may have dismissed the sheet while the save was in flight —
    // going back then would pop whatever screen they're on now instead.
    if (navigation.isFocused()) close();
  }, [edit, close, navigation]);

  return (
    <Sheet detents={[1]} dismissible>
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

          <View style={Atoms.gap_xs}>
            <View
              style={[
                Atoms.flex_row,
                Atoms.items_center,
                Atoms.gap_xs,
                { zIndex: ZIndex.raised },
              ]}
            >
              <Text variant="small" color="neutral_500">
                ALIAS
              </Text>
              <InfoTooltip text="An alias like you@yourdomain.com (or just yourdomain.com) that points to this profile. Your domain must be set up to link back here before it can be saved." />
            </View>
            <TextInput
              value={edit.aliasDraft}
              onChangeText={edit.setAliasDraft}
              placeholder="user@domain.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            {edit.aliasError ? (
              <Text variant="small" color="negative_500">
                {edit.aliasError}
              </Text>
            ) : null}
            <Link
              href="https://polycentric.dev/setting-up-an-alias"
              accessibilityRole="link"
            >
              <Text variant="small" color="neutral_500">
                How to set up an alias ↗
              </Text>
            </Link>
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
