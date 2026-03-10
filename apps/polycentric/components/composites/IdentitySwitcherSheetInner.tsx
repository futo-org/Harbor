import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  createContext,
  useContext,
} from 'react';
import {
  Pressable,
  FlatList,
  ListRenderItemInfo,
  Animated,
} from 'react-native';
import Reanimated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import {
  Text,
  LinkButton,
  IconButton,
  Button,
  SelectionIndicator,
} from '@/components/primitives';
import { Box } from '@/components/layouts';
import { IdentityBadge } from '@/components/composites/IdentityBadge';
import { useSheetContext } from '@/lib/sheet';
import {
  usePolycentric,
  useCurrentIdentity,
  pubkeyStr,
  DEFAULT_SERVER,
} from '@/lib/polycentric-hooks';
import { types } from '@polycentric/react-native';
import { useTheme } from '@/theme';
import { useFadeIn } from '@/lib/animation';

type IdentityKeyPair = {
  keyType: number;
  privateKey: types.PrivateKey;
  publicKey: types.PublicKey;
};

interface IdentitySwitcherContextType {
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  dismiss: () => Promise<void>;
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

interface IdentitySwitcherSheetInnerProps {
  dismiss: () => Promise<void>;
}

export function IdentitySwitcherSheetInner({
  dismiss,
}: IdentitySwitcherSheetInnerProps) {
  const client = usePolycentric();
  const { isOpen, setHeader, setFooter } = useSheetContext();
  const [identities, setIdentities] = useState<IdentityKeyPair[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  const refreshIdentities = useCallback(() => {
    setIdentities(client.getAllIdentities());
  }, [client]);

  const handleCreateIdentity = useCallback(async () => {
    await client.createIdentity(DEFAULT_SERVER);
    await client.sync().catch(() => {});
    refreshIdentities();
  }, [client, refreshIdentities]);

  const contextValue = useMemo(
    () => ({ isEditing, setIsEditing, dismiss }),
    [isEditing, dismiss],
  );

  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
    }
  }, [isOpen]);

  useEffect(() => {
    setHeader(<Header isEditing={isEditing} setIsEditing={setIsEditing} />);
    setFooter(
      isEditing ? <Footer onCreateIdentity={handleCreateIdentity} /> : null,
    );
  }, [isEditing, handleCreateIdentity]);

  useEffect(() => {
    refreshIdentities();
  }, [refreshIdentities]);

  return (
    <IdentitySwitcherContext.Provider value={contextValue}>
      {isEditing ? (
        <DraggableFlatList
          data={identities}
          keyExtractor={(item) => pubkeyStr(item.publicKey)}
          renderItem={(props) => <DraggableIdentityListItem {...props} />}
          onDragEnd={({ data }) => setIdentities(data)}
        />
      ) : (
        <FlatList
          data={identities}
          keyExtractor={(item) => pubkeyStr(item.publicKey)}
          renderItem={(props) => <StaticIdentityListItem {...props} />}
        />
      )}
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
      padding="md"
      marginVertical="xs"
      marginHorizontal="lg"
      style={{
        backgroundColor: isActive
          ? theme.colors.primaryOpacity20
          : isCurrent
            ? theme.colors.neutralSurfaceOpacity20
            : undefined,
        borderRadius: theme.borderRadius.md,
        borderWidth: DRAG_BORDER_WIDTH,
        borderColor: isActive ? theme.colors.primaryOpacity60 : 'transparent',
        borderStyle: 'dashed',
      }}
    >
      <Box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        gap="md"
      >
        <IdentityBadge publicKey={item.publicKey} />
        <Box flexDirection="row" alignItems="center" gap="md">
          {isCurrent && <SelectionIndicator />}
          {isEditing && <DeleteButton />}
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

function DeleteButton() {
  const { theme } = useTheme();
  const { animatedStyle } = useFadeIn({ duration: 150 });

  return (
    <Animated.View style={animatedStyle}>
      <IconButton
        variant="ghost"
        compact
        icon={() => (
          <Ionicons name="close-sharp" size={24} color={theme.colors.text} />
        )}
        onPress={() => {}}
      />
    </Animated.View>
  );
}

function Header({
  isEditing,
  setIsEditing,
}: {
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
}) {
  return (
    <>
      <Box
        marginTop="xl"
        marginBottom="lg"
        marginHorizontal="lg"
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <Text fontSize={18} fontWeight="semibold">
          {isEditing ? 'Editing identities' : 'Your identities'}
        </Text>
        <LinkButton
          title={isEditing ? 'Done' : 'Edit'}
          onPress={() => setIsEditing(!isEditing)}
        />
      </Box>
      <Box
        height={1.5}
        backgroundColor={
          isEditing ? 'warningOpacity20' : 'neutralSurfaceOpacity20'
        }
      />
    </>
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
      <BlurView
        intensity={80}
        tint="dark"
        style={{
          width: '100%',
          paddingTop: theme.spacing.lg,
          paddingBottom: theme.spacing.xl,
          backgroundColor: 'rgba(0,0,0,0.7)',
        }}
      >
        <Box paddingHorizontal="lg">
          <Button
            variant="tertiary"
            title={isCreating ? 'Creating...' : 'Create new identity'}
            fullWidth
            disabled={isCreating}
            icon={() => (
              <Ionicons name="person-add-outline" size={20} color="white" />
            )}
            onPress={handlePress}
          />
        </Box>
      </BlurView>
    </Reanimated.View>
  );
}
