import { WEB_MAX_CONTENT_WIDTH } from '@/src/common/constants';
import { useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { SheetDetent, TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

export interface SheetContextType {
  isOpen: boolean;
  dismissSheet: () => Promise<void>;
}

export const SheetContext = createContext<SheetContextType | undefined>(
  undefined,
);

export function useSheetContext() {
  const context = useContext(SheetContext);
  if (!context) {
    throw new Error('useSheetContext must be used within Sheet');
  }
  return context;
}

interface SheetProps {
  children: ReactNode;
  detents?: SheetDetent[];
  dismissible?: boolean;
  scrollable?: boolean;
}

interface SheetHandle {
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

const SheetInnerNative = forwardRef<SheetHandle, SheetProps>(
  (
    { children, detents = [0.5], dismissible = true, scrollable = false },
    ref,
  ) => {
    const { theme } = useTheme();
    const sheetRef = useRef<TrueSheet>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    const isAnimatingRef = useRef(false);
    isAnimatingRef.current = isAnimating;

    const dismissSheet = useCallback(async () => {
      await sheetRef.current?.dismiss();
    }, []);

    useImperativeHandle(ref, () => ({
      present: async () => {
        // edge case: wait for dismiss animation to complete before presenting
        // TrueSheet loses state if you present while dismissing
        while (isAnimatingRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 12));
        }
        await sheetRef.current?.present();
      },
      dismiss: dismissSheet,
    }));

    const surface = theme.palette.neutral_0;

    const sheetContextValue = useMemo(
      () => ({
        isOpen,
        dismissSheet,
      }),
      [isOpen, dismissSheet],
    );

    return (
      <TrueSheet
        dimmed={false}
        backgroundColor={surface}
        onWillDismiss={() => setIsAnimating(true)}
        onDidDismiss={() => {
          setIsOpen(false);
          setIsAnimating(false);
        }}
        onDidPresent={() => setIsOpen(true)}
        ref={sheetRef}
        detents={detents}
        dismissible={dismissible}
        scrollable={scrollable}
      >
        <SheetContext.Provider value={sheetContextValue}>
          <View style={[styles.sheetBody, { backgroundColor: surface }]}>
            {children}
          </View>
        </SheetContext.Provider>
      </TrueSheet>
    );
  },
);
SheetInnerNative.displayName = 'SheetInnerNative';

const SheetInnerWeb = forwardRef<SheetHandle, SheetProps>(
  (
    { children, detents = [0.5], dismissible = true, scrollable = false },
    ref,
  ) => {
    const { theme } = useTheme();
    const [visible, setVisible] = useState(false);

    const rawDetent = detents[0];
    const detentFrac =
      typeof rawDetent === 'number' && rawDetent > 0 && rawDetent <= 1
        ? rawDetent
        : 0.5;
    const windowHeight = Dimensions.get('window').height;
    const maxSheetHeight = windowHeight * detentFrac;

    const dismissSheet = useCallback(async () => {
      if (dismissible) setVisible(false);
    }, [dismissible]);

    useImperativeHandle(ref, () => ({
      present: async () => {
        setVisible(true);
      },
      dismiss: dismissSheet,
    }));

    const surface = theme.palette.neutral_0;

    const close = dismissSheet;

    const sheetContextValue = useMemo(
      () => ({
        isOpen: visible,
        dismissSheet,
      }),
      [visible, dismissSheet],
    );

    const body = scrollable ? (
      <ScrollView
        style={styles.webScroll}
        contentContainerStyle={styles.webScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    ) : (
      children
    );

    return (
      <Modal
        visible={visible}
        transparent
        onRequestClose={dismissible ? close : undefined}
      >
        <View style={styles.webModalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFill, styles.webDim]}
            onPress={close}
            accessibilityLabel="Dismiss sheet"
          />
          <View style={styles.webModalCenter} pointerEvents="box-none">
            <View
              style={[
                styles.webSheet,
                {
                  backgroundColor: surface,
                  maxHeight: maxSheetHeight,
                },
              ]}
            >
              <SheetContext.Provider value={sheetContextValue}>
                <View
                  style={[
                    styles.sheetBody,
                    scrollable ? styles.webBodyScroll : styles.webBodyFill,
                  ]}
                >
                  {body}
                </View>
              </SheetContext.Provider>
            </View>
          </View>
        </View>
      </Modal>
    );
  },
);
SheetInnerWeb.displayName = 'SheetInnerWeb';

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
    minHeight: 280,
    borderRadius: 16,
    overflow: 'hidden',
  },
  webBodyFill: {
    flexGrow: 1,
    minHeight: 0,
  },
  webBodyScroll: {
    flexGrow: 1,
    minHeight: 0,
  },
  webScroll: {
    flexGrow: 1,
  },
  webScrollContent: {
    flexGrow: 1,
  },
});

interface UseSheetReturn {
  Sheet: FC<SheetProps>;
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

export function useSheet(): UseSheetReturn {
  const handleRef = useRef<SheetHandle>(null);

  const present = useCallback(async () => {
    await handleRef.current?.present();
  }, []);

  const dismiss = useCallback(async () => {
    await handleRef.current?.dismiss();
  }, []);

  const Sheet = useMemo(() => {
    if (isWeb) {
      const BoundWeb = forwardRef<SheetHandle, SheetProps>((props, _ref) => (
        <SheetInnerWeb ref={handleRef} {...props} />
      ));
      BoundWeb.displayName = 'Sheet';
      return BoundWeb;
    }
    const BoundSheet = forwardRef<SheetHandle, SheetProps>((props, _ref) => (
      <SheetInnerNative ref={handleRef} {...props} />
    ));
    BoundSheet.displayName = 'Sheet';
    return BoundSheet;
  }, []);

  return { Sheet, present, dismiss };
}
