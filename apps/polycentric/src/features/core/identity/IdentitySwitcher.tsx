import { IdentityBadge } from '@/src/common/components/composites/IdentityBadge';
import {
  Button,
  IconButton,
  LinkButton,
  SelectionIndicator,
} from '@/src/common/components/primitives';
import { useFadeIn } from '@/src/common/lib/animation';
import { confirm } from '@/src/common/lib/dialogs/alert';
import {
  DEFAULT_SERVER,
  pubkeyStr,
  useCurrentIdentity,
  useIdentities,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { SheetHeaderBlock, type DismissSheet } from '@/src/common/lib/sheet';
import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import {
  createIdentity,
  KEY_TYPE,
  type KeyPair,
} from '@polycentric/react-native';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  Animated,
  FlatList,
  ListRenderItemInfo,
  Platform,
  Pressable,
  View,
} from 'react-native';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import Reanimated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';

type IdentityKeyPair = KeyPair;

interface IdentitySwitcherContextType {
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  dismiss: () => Promise<void>;
  onDeleteIdentity: (keyPair: IdentityKeyPair) => void;
}

const IdentitySwitcherContext =
  createContext<IdentitySwitcherContextType | null>(null);

function useIdentitySwitcher() {
  const context = useContext(IdentitySwitcherContext);
  if (!context) {
    throw new Error(
      'useIdentitySwitcher must be used within IdentitySwitcherSheetInner',
    );
  }
  return context;
}

export function IdentitySwitcher({
  dismissSheet,
}: {
  dismissSheet: DismissSheet;
}) {
  const client = usePolycentric();
  const identities = useIdentities();
  const [isEditing, setIsEditing] = useState(false);

  const handleCreateIdentity = useCallback(async () => {
    // Adding a second identity on this device means generating a fresh
    // keypair for it; the initial device-wide keypair stays paired with
    // whatever identity it currently owns.
    await client.keyPairManager.createKeyPair({
      keyType: KEY_TYPE.ED25519,
      setAsCurrent: true,
    });
    await createIdentity(client, DEFAULT_SERVER);
    await client.sync().catch(() => {});
  }, [client]);

  const handleDeleteIdentity = useCallback(
    async (_keyPair: IdentityKeyPair) => {
      const ok = await confirm({
        title: 'Delete identity',
        message: 'Are you sure? This cannot be undone.',
        confirmText: 'Delete',
      });
      if (!ok) return;
      // TODO: deleteKeyPair not yet implemented in v2
      console.warn('Delete identity not yet implemented in v2');
    },
    [],
  );

  const contextValue = useMemo(
    () => ({
      isEditing,
      setIsEditing,
      dismiss: dismissSheet,
      onDeleteIdentity: handleDeleteIdentity,
    }),
    [isEditing, dismissSheet, handleDeleteIdentity],
  );

  return (
    <IdentitySwitcherContext.Provider value={contextValue}>
      <View style={Atoms.flex_1}>
        <SheetHeaderBlock
          title={isEditing ? 'Editing identities' : 'Your identities'}
          onClose={() => void dismissSheet()}
          trailing={
            <View style={{ minWidth: 72, alignItems: 'flex-end' }}>
              <LinkButton
                title={isEditing ? 'Done' : 'Edit'}
                onPress={() => setIsEditing(!isEditing)}
                underlineOnHover
              />
            </View>
          }
        />
        <View style={Atoms.flex_1}>
          {isEditing ? (
            <DraggableFlatList
              data={identities}
              keyExtractor={(item) => pubkeyStr(item.publicKey)}
              renderItem={(props) => <DraggableIdentityListItem {...props} />}
              onDragEnd={() => {}}
              containerStyle={Atoms.flex_1}
              style={Atoms.flex_1}
              nestedScrollEnabled
              removeClippedSubviews={Platform.OS !== 'android'}
            />
          ) : (
            <FlatList
              data={identities}
              keyExtractor={(item) => pubkeyStr(item.publicKey)}
              renderItem={(props) => <StaticIdentityListItem {...props} />}
              style={Atoms.flex_1}
              nestedScrollEnabled
              removeClippedSubviews={Platform.OS !== 'android'}
            />
          )}
        </View>
        {isEditing ? <Footer onCreateIdentity={handleCreateIdentity} /> : null}
      </View>
    </IdentitySwitcherContext.Provider>
  );
}

const DRAG_BORDER_WIDTH = 1.5;

function IdentityListItemContent({
  item,
  isActive = false,
  hovered = false,
}: {
  item: IdentityKeyPair;
  isActive?: boolean;
  hovered?: boolean;
}) {
  const { theme } = useTheme();
  const { isEditing } = useIdentitySwitcher();
  const { isCurrentIdentity, client } = useCurrentIdentity();

  const identityKey = client.getIdentityKeyFor(item);
  const isCurrent = isCurrentIdentity(identityKey);

  const hoverSurface =
    hovered && !isActive
      ? withHexOpacity(
          theme.palette.neutral_500,
          theme.scheme === 'dark' ? '18' : '10',
        )
      : null;

  const backgroundColor = isActive
    ? theme.palette.primary_50
    : (hoverSurface ?? (isCurrent ? theme.palette.neutral_50 : undefined));

  return (
    <View
      style={[
        Atoms.p_md,
        Atoms.my_xs,
        Atoms.mx_lg,
        Atoms.rounded_md,
        {
          backgroundColor,
          borderWidth: DRAG_BORDER_WIDTH,
          borderColor: isActive ? theme.palette.primary_400 : 'transparent',
          borderStyle: 'dashed',
        },
      ]}
    >
      <View
        style={[
          Atoms.flex_row,
          Atoms.justify_between,
          Atoms.items_center,
          Atoms.gap_md,
        ]}
      >
        {identityKey ? (
          <IdentityBadge identityKey={identityKey} />
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_md]}>
          {isCurrent && <SelectionIndicator />}
          {isEditing && <DeleteButton keyPair={item} />}
        </View>
      </View>
    </View>
  );
}

function StaticIdentityListItem({ item }: ListRenderItemInfo<IdentityKeyPair>) {
  const { isCurrentIdentity, switchIdentity, client } = useCurrentIdentity();
  const { dismiss } = useIdentitySwitcher();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const identityKey = client.getIdentityKeyFor(item);
  const isCurrent = isCurrentIdentity(identityKey);

  const handleSwitchIdentity = async () => {
    // Start dismiss animation, then switch identity after animation begins
    // TrueSheet needs time to register the dismiss before state changes
    // TODO: use truesheet events instead of a timeout
    dismiss();
    setTimeout(() => {
      switchIdentity(item.publicKey);
    }, 215);
  };

  return (
    <Pressable
      onPress={() => !isCurrent && handleSwitchIdentity()}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
    >
      <IdentityListItemContent item={item} hovered={hovered} />
    </Pressable>
  );
}

// TODO: Create haptic feedback wrapper
function DraggableIdentityListItem({
  item,
  drag,
  isActive,
}: RenderItemParams<IdentityKeyPair>) {
  return (
    <ScaleDecorator activeScale={1.03}>
      <Pressable onLongPress={drag} disabled={isActive}>
        <IdentityListItemContent item={item} isActive={isActive} />
      </Pressable>
    </ScaleDecorator>
  );
}

function DeleteButton({ keyPair }: { keyPair: IdentityKeyPair }) {
  const { theme } = useTheme();
  const { animatedStyle } = useFadeIn({ duration: 150 });
  const { onDeleteIdentity } = useIdentitySwitcher();

  return (
    <Animated.View style={animatedStyle}>
      <IconButton
        variant="ghost"
        compact
        icon={() => (
          <Ionicons
            name="close-sharp"
            size={24}
            color={theme.palette.neutral_1000}
          />
        )}
        onPress={() => onDeleteIdentity(keyPair)}
      />
    </Animated.View>
  );
}

export function Footer({
  onCreateIdentity,
}: {
  onCreateIdentity: () => Promise<void>;
}) {
  const { theme } = useTheme();
  const [isCreating, setIsCreating] = useState(false);

  const handlePress = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      await onCreateIdentity();
    } catch (err) {
      console.error('Failed to create identity:', err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Reanimated.View
      entering={SlideInDown.duration(200)}
      exiting={SlideOutDown.duration(200)}
    >
      <View
        style={[
          Atoms.w_full,
          Atoms.px_lg,
          Atoms.pt_lg,
          Atoms.pb_xl,
          {
            backgroundColor: theme.palette.background_primary,
            borderTopWidth: 1,
            borderTopColor: theme.palette.neutral_200,
          },
        ]}
      >
        <Button
          variant="tertiary"
          title={isCreating ? 'Creating...' : 'Create new identity'}
          fullWidth
          disabled={isCreating}
          icon={() => (
            <Ionicons
              name="person-add-outline"
              size={20}
              color={theme.palette.neutral_1000}
            />
          )}
          onPress={handlePress}
        />
      </View>
    </Reanimated.View>
  );
}
