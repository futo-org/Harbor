import { IdentityBadge } from '@/src/common/components/composites/IdentityBadge';
import { Box } from '@/src/common/components/layouts';
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
import { SheetHeaderBlock, useSheetContext } from '@/src/common/lib/sheet';
import { Atoms, useTheme } from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import {
  createIdentityWithDefaultServer,
  type KeyPair,
  types,
} from '@polycentric/react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Animated,
  FlatList,
  ListRenderItemInfo,
  Platform,
  Pressable,
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
  onDeleteIdentity: (publicKey: types.PublicKey) => void;
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

export function IdentitySwitcherSheetInner() {
  const client = usePolycentric();
  const { isOpen, dismissSheet } = useSheetContext();
  const identities = useIdentities();
  const [isEditing, setIsEditing] = useState(false);

  const handleCreateIdentity = useCallback(async () => {
    await createIdentityWithDefaultServer(client, DEFAULT_SERVER);
    await client.sync().catch(() => {});
  }, [client]);

  const handleDeleteIdentity = useCallback(
    async (publicKey: types.PublicKey) => {
      const ok = await confirm({
        title: 'Delete identity',
        message: 'Are you sure? This cannot be undone.',
        confirmText: 'Delete',
      });
      if (!ok) return;
      await client.deleteIdentity(publicKey);
    },
    [client],
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

  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
    }
  }, [isOpen]);

  return (
    <IdentitySwitcherContext.Provider value={contextValue}>
      <Box style={Atoms.flex_1}>
        <SheetHeaderBlock
          title={isEditing ? 'Editing identities' : 'Your identities'}
          onClose={() => void dismissSheet()}
          trailing={
            <Box style={{ minWidth: 72, alignItems: 'flex-end' }}>
              <LinkButton
                title={isEditing ? 'Done' : 'Edit'}
                onPress={() => setIsEditing(!isEditing)}
              />
            </Box>
          }
        />
        <Box style={Atoms.flex_1}>
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
        </Box>
        {isEditing ? <Footer onCreateIdentity={handleCreateIdentity} /> : null}
      </Box>
    </IdentitySwitcherContext.Provider>
  );
}

const DRAG_BORDER_WIDTH = 1.5;

function IdentityListItemContent({
  item,
  isActive = false,
}: {
  item: IdentityKeyPair;
  isActive?: boolean;
}) {
  const { theme } = useTheme();
  const { isEditing } = useIdentitySwitcher();
  const { isCurrentIdentity } = useCurrentIdentity();

  const isCurrent = isCurrentIdentity(item.publicKey);

  return (
    <Box
      style={[
        Atoms.p_md,
        Atoms.my_xs,
        Atoms.mx_lg,
        Atoms.rounded_md,
        {
          backgroundColor: isActive
            ? theme.palette.primary_50
            : isCurrent
              ? theme.palette.neutral_50
              : undefined,
          borderWidth: DRAG_BORDER_WIDTH,
          borderColor: isActive ? theme.palette.primary_400 : 'transparent',
          borderStyle: 'dashed',
        },
      ]}
    >
      <Box
        style={[
          Atoms.flex_row,
          Atoms.justify_between,
          Atoms.items_center,
          Atoms.gap_md,
        ]}
      >
        <IdentityBadge publicKey={item.publicKey} />
        <Box style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_md]}>
          {isCurrent && <SelectionIndicator />}
          {isEditing && <DeleteButton publicKey={item.publicKey} />}
        </Box>
      </Box>
    </Box>
  );
}

function StaticIdentityListItem({ item }: ListRenderItemInfo<IdentityKeyPair>) {
  const { isCurrentIdentity, switchIdentity } = useCurrentIdentity();
  const { dismiss } = useIdentitySwitcher();

  const isCurrent = isCurrentIdentity(item.publicKey);

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
    <Pressable onPress={() => !isCurrent && handleSwitchIdentity()}>
      <IdentityListItemContent item={item} />
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

function DeleteButton({ publicKey }: { publicKey: types.PublicKey }) {
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
        onPress={() => onDeleteIdentity(publicKey)}
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
      <Box
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
      </Box>
    </Reanimated.View>
  );
}
