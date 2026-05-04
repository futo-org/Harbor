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
  onClose,
}: SheetMenuProps) {
  const { theme } = useTheme();
  const sheetRef = useRef<TrueSheet>(null);

  /** True while dismissing during React unmount — skip onClose (parent is already gone). */
  const skipOnCloseRef = useRef(false);
  const dismissReasonRef = useRef<DismissReason>(DismissReason.UserDismissed);

  const dismissSheet = useCallback(
    async (reason: DismissReason = DismissReason.UserDismissed) => {
      dismissReasonRef.current = reason;
      await sheetRef.current?.dismiss().catch(() => {});
    },
    [],
  );

  useEffect(() => {
    return () => {
      skipOnCloseRef.current = true;
      sheetRef.current?.dismiss().catch(() => {});
    };
  }, []);

  const surface = theme.palette.neutral_0;

  return (
    <TrueSheet
      dimmed={false}
      backgroundColor={surface}
      onDidDismiss={() => {
        const reason = dismissReasonRef.current;
        dismissReasonRef.current = DismissReason.UserDismissed;
        if (!skipOnCloseRef.current) {
          onClose?.(reason);
        }
      }}
      ref={sheetRef}
      detents={detents}
      initialDetentIndex={0}
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
      visible={true}
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
    width: '100%',
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
