import { Text } from '@/src/common/components/primitives/Text';
import { createThemedStyles } from '@/src/common/theme';
import type { ComponentProps } from 'react';
import Animated from 'react-native-reanimated';
import { useIdentityHandle } from './hooks/useIdentityHandle';

const AnimatedText = Animated.createAnimatedComponent(Text);

type IdentityHandleProps = Omit<
  ComponentProps<typeof Text>,
  'children' | 'numberOfLines'
> & {
  identity: string | null | undefined;
};

/** Every identity alias or shortened id in the app renders through this. */
export function IdentityHandle({
  identity,
  variant = 'secondary',
  color = 'neutral_500',
  style,
  ...textProps
}: IdentityHandleProps) {
  const styles = useStyles();
  const handle = useIdentityHandle(identity);

  return (
    <AnimatedText
      {...textProps}
      variant={variant}
      color={color}
      numberOfLines={1}
      monospace={handle.kind === 'hash'}
      style={[
        style,
        styles.handle,
        handle.kind === 'alias-pending' && styles.handlePending,
      ]}
    >
      {handle.text}
    </AnimatedText>
  );
}

const useStyles = createThemedStyles((_theme, define) =>
  define({
    // Fades in on verification; no animation on the first render.
    handle: {
      opacity: 1,
      transitionProperty: 'opacity',
      transitionDuration: 400,
    },
    handlePending: { opacity: 0.4 },
  }),
);
