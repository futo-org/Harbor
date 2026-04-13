import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useMemo } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenProps {
  children: React.ReactNode;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  keyboardAvoiding?: boolean;
}

export function Screen({
  children,
  edges = ['top', 'bottom'],
  keyboardAvoiding = false,
}: ScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const nativePadding = useMemo(
    () => ({
      paddingTop: edges.includes('top') ? insets.top : 0,
      paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
      paddingLeft: edges.includes('left') ? insets.left : 0,
      paddingRight: edges.includes('right') ? insets.right : 0,
    }),
    [insets, edges],
  );

  if (isWeb) {
    return (
      <View style={[Atoms.flex_1, theme.atoms.bg, { position: 'relative' }]}>
        {children}
      </View>
    );
  }

  const body = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={Atoms.flex_1}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.bottom}
    >
      {children}
    </KeyboardAvoidingView>
  ) : (
    children
  );

  return (
    <View style={[Atoms.flex_1, theme.atoms.bg, nativePadding]}>{body}</View>
  );
}
