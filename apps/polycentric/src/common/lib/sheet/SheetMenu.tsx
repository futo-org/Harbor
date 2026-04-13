import { WEB_MAX_CONTENT_WIDTH } from '@/src/common/constants';
import { useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { SheetDetent, TrueSheet } from '@lodev09/react-native-true-sheet';
import { useCallback, useEffect, useRef, type FC, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

export enum DismissReason {
  UserDismissed = 'user-dismissed',
  PostSubmitted = 'post-submitted',
}

export type DismissSheet = (reason?: DismissReason) => Promise<void>;

export type SheetMenuProps = {
  open: boolean;
  children: (dismissSheet: DismissSheet) => ReactNode;
  detents?: SheetDetent[];
  dismissible?: boolean;
  scrollable?: boolean;
  onClose?: (reason: DismissReason) => void;
};

function SheetMenuInnerNative({
  children,
  detents = [0.5],
  dismissible = true,
  scrollable = false,
  open,
  onClose,
}: SheetMenuProps) {
  const { theme } = useTheme();
  const sheetRef = useRef<TrueSheet>(null);

  const presentedRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const dismissReasonRef = useRef<DismissReason>(DismissReason.UserDismissed);

  const dismissSheet = useCallback(
    async (reason: DismissReason = DismissReason.UserDismissed) => {
      dismissReasonRef.current = reason;
      await sheetRef.current?.dismiss().catch(() => {});
    },
    [],
  );

  useEffect(() => {
    if (open && !presentedRef.current) {
      sheetRef.current?.present().catch(() => {});
    } else if (!open && presentedRef.current) {
      sheetRef.current?.dismiss().catch(() => {});
    }
  }, [open]);

  const surface = theme.palette.neutral_0;

  return (
    <TrueSheet
      dimmed={false}
      backgroundColor={surface}
      onDidPresent={() => {
        presentedRef.current = true;
      }}
      onDidDismiss={() => {
        presentedRef.current = false;
        const reason = dismissReasonRef.current;
        dismissReasonRef.current = DismissReason.UserDismissed;
        if (openRef.current) {
          onClose?.(reason);
        }
      }}
      ref={sheetRef}
      detents={detents}
      dismissible={dismissible}
      scrollable={scrollable}
    >
      <View style={[styles.sheetBody, { backgroundColor: surface }]}>
        {children(dismissSheet)}
      </View>
    </TrueSheet>
  );
}

function SheetMenuInnerWeb({
  children,
  dismissible = true,
  open,
  onClose,
}: SheetMenuProps) {
  const { theme } = useTheme();

  const dismissSheet = useCallback(
    async (reason: DismissReason = DismissReason.UserDismissed) => {
      onClose?.(reason);
    },
    [onClose],
  );

  return (
    <Modal
      visible={open}
      transparent
      onRequestClose={dismissible ? () => void dismissSheet() : undefined}
    >
      <View style={styles.webModalRoot}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.webDim]}
          onPress={dismissible ? () => void dismissSheet() : undefined}
          accessibilityLabel="Dismiss sheet"
        />
        <View style={styles.webModalCenter} pointerEvents="box-none">
          <View
            style={[
              styles.webSheet,
              { backgroundColor: theme.palette.neutral_0 },
            ]}
          >
            {children(dismissSheet)}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetBody: {
    flex: 1,
  },
  webModalRoot: {
    flex: 1,
  },
  webModalCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    maxWidth: '100%',
    width: '100%',
    alignSelf: 'center',
  },
  webDim: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  webSheet: {
    width: '100%',
    maxWidth: WEB_MAX_CONTENT_WIDTH,
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
  },
});

export const SheetMenu: FC<SheetMenuProps> = (props) =>
  isWeb ? (
    <SheetMenuInnerWeb {...props} />
  ) : (
    <SheetMenuInnerNative {...props} />
  );
