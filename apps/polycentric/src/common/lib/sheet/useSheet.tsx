import { TrueSheet, SheetDetent } from '@lodev09/react-native-true-sheet';
import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { useTheme } from '@/src/common/theme';

interface SheetContextType {
  isOpen: boolean;
  setFooter: (footer: React.ReactElement | null) => void;
  setHeader: (header: React.ReactElement | null) => void;
}

const SheetContext = createContext<SheetContextType | undefined>(undefined);

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

const SheetInner = forwardRef<SheetHandle, SheetProps>(
  (
    { children, detents = [0.5], dismissible = true, scrollable = false },
    ref,
  ) => {
    const { theme } = useTheme();
    const sheetRef = useRef<TrueSheet>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [footer, setFooter] = useState<React.ReactElement | null>(null);
    const [header, setHeader] = useState<React.ReactElement | null>(null);

    const isAnimatingRef = useRef(false);
    isAnimatingRef.current = isAnimating;

    useImperativeHandle(ref, () => ({
      present: async () => {
        // edge case: wait for dismiss animation to complete before presenting
        // TrueSheet looses state if you present while dismissing
        while (isAnimatingRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 12));
        }
        await sheetRef.current?.present();
      },
      dismiss: async () => {
        await sheetRef.current?.dismiss();
      },
    }));

    const iosBlur =
      theme.scheme === 'dark'
        ? ('system-thick-material-dark' as const)
        : ('system-thick-material-light' as const);

    const platformProps = Platform.select({
      ios: {
        backgroundBlur: iosBlur,
        blurOptions: { intensity: 80, interaction: true },
        backgroundColor: 'transparent',
      },
      default: {
        backgroundColor: theme.palette.background_primary,
      },
    });

    return (
      <TrueSheet
        onWillDismiss={() => setIsAnimating(true)}
        onDidDismiss={() => {
          setIsOpen(false);
          setIsAnimating(false);
        }}
        onDidPresent={() => setIsOpen(true)}
        ref={sheetRef}
        detents={detents}
        dismissible={dismissible}
        footer={footer || undefined}
        header={header || undefined}
        scrollable={scrollable}
        {...platformProps}
      >
        <SheetContext.Provider value={{ isOpen, setFooter, setHeader }}>
          <View
            style={[
              styles.sheetBody,
              { backgroundColor: theme.palette.background_primary },
            ]}
          >
            {children}
          </View>
        </SheetContext.Provider>
      </TrueSheet>
    );
  },
);
SheetInner.displayName = 'SheetInner';

const styles = StyleSheet.create({
  sheetBody: {
    flex: 1,
  },
});

interface UseSheetReturn {
  Sheet: React.FC<SheetProps>;
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

/**
 * Returns a Sheet component with present/dismiss controls.
 *
 * This hook encapsulates ref management so consumers don't need to create
 * and wire up their own ref to call TrueSheet's imperative methods.
 *
 * Example:
 *   const { Sheet, present, dismiss } = useSheet();
 *   <Button onPress={present} />
 *   <Sheet><Content /></Sheet>
 */
export function useSheet(): UseSheetReturn {
  const handleRef = useRef<SheetHandle>(null);

  const present = useCallback(async () => {
    await handleRef.current?.present();
  }, []);

  const dismiss = useCallback(async () => {
    await handleRef.current?.dismiss();
  }, []);

  const Sheet = useMemo(() => {
    const BoundSheet = forwardRef<SheetHandle, SheetProps>((props, _ref) => (
      <SheetInner ref={handleRef} {...props} />
    ));
    BoundSheet.displayName = 'Sheet';
    return BoundSheet;
  }, []);

  return { Sheet, present, dismiss };
}
