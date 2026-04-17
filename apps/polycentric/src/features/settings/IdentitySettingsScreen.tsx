import { DismissReason, SheetMenu } from '@/src/common/lib/sheet';
import {
  Avatar,
  Button,
  LinkButton,
  Text,
  TextInput,
} from '@/src/common/components';
import {
  identiconUrl,
  publicKeyToString,
  usePolycentric,
  useUsername,
  useCurrentIdentity,
} from '@/src/common/lib/polycentric-hooks';
import { SheetHeaderBlock, type DismissSheet } from '@/src/common/lib/sheet';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { types } from '@polycentric/react-native';
import { Link, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

export function IdentitySettings({
  publicKey,
  dismissSheet,
}: {
  publicKey: types.PublicKey;
  dismissSheet: DismissSheet;
}) {
  const { theme } = useTheme();
  const client = usePolycentric();
  const { identity } = useCurrentIdentity();
  const username = useUsername(publicKey);

  const [nameExpanded, setNameExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    setNameDraft(username);
  }, [username]);

  // TODO: Event count requires v2 storage APIs
  useEffect(() => {
    setEventCount(0);
  }, [client, identity]);

  // TODO: Username editing requires v2 content manager APIs
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      console.warn('Username editing not yet implemented in v2');
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [nameDraft]);

  const handleCancel = useCallback(() => {
    setNameDraft(username);
    setEditing(false);
  }, [username]);

  const fullPubkey = publicKeyToString(publicKey);
  const processId = '';
  const displayName = username;
  const avatarUrl = identiconUrl(publicKey, 160);

  return (
    <View style={Atoms.flex_1}>
      <SheetHeaderBlock title="Identity" onClose={() => void dismissSheet()} />
      <View style={[Atoms.p_lg, Atoms.gap_xl]}>
        {/* Hero: avatar + name */}
        <View style={[Atoms.items_center, Atoms.gap_md, { paddingTop: 8 }]}>
          <Link href={'/feed/compose'}>
            <Avatar
              source={avatarUrl ? { uri: avatarUrl } : undefined}
              size="massive"
            />
          </Link>

          {editing ? (
            <View style={[Atoms.gap_sm, { width: '100%' }]}>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder="Display name"
                autoFocus
              />
              <View
                style={[Atoms.flex_row, Atoms.gap_sm, Atoms.justify_center]}
              >
                <Button
                  title={saving ? 'Saving...' : 'Save'}
                  onPress={handleSave}
                  variant="primary"
                  size="sm"
                />
                <Button
                  title="Cancel"
                  onPress={handleCancel}
                  variant="tertiary"
                  size="sm"
                />
              </View>
            </View>
          ) : (
            <View style={[Atoms.items_center, Atoms.gap_xs]}>
              <Text
                variant="title"
                fontWeight="bold"
                numberOfLines={nameExpanded ? undefined : 2}
                ellipsizeMode="tail"
                style={{ textAlign: 'center' }}
                onPress={() => setNameExpanded((v) => !v)}
              >
                {displayName || 'Anonymous'}
              </Text>
              <LinkButton
                title="Edit name"
                onPress={() => setEditing(true)}
                underlineOnHover
              />
            </View>
          )}

          <Text variant="subtitle" color="neutral_500">
            {eventCount} {eventCount === 1 ? 'event' : 'events'}
          </Text>
        </View>

        {/* Details */}
        <View
          style={[
            Atoms.gap_md,
            Atoms.p_md,
            Atoms.rounded_md,
            {
              backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
            },
          ]}
        >
          <View style={Atoms.gap_xs}>
            <Text variant="small" color="neutral_500">
              PUBLIC KEY
            </Text>
            <Text
              variant="secondary"
              style={{ fontFamily: 'monospace' }}
              selectable
            >
              {fullPubkey}
            </Text>
          </View>

          <View
            style={{
              height: 1,
              backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
            }}
          />

          <View style={Atoms.gap_xs}>
            <Text variant="small" color="neutral_500">
              PROCESS ID
            </Text>
            <Text
              variant="secondary"
              style={{ fontFamily: 'monospace' }}
              selectable
            >
              {processId}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function IdentitySettingsScreen() {
  const { publicKey } = useCurrentIdentity();

  if (!publicKey) return null;

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
        <IdentitySettings publicKey={publicKey} dismissSheet={dismissSheet} />
      )}
    </SheetMenu>
  );
}
