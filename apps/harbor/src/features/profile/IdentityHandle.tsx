import { InlineLink } from '@/src/common/components/primitives/InlineLink';
import { Text } from '@/src/common/components/primitives/Text';
import { Routes } from '@/src/common/constants';
import { Atoms, createThemedStyles } from '@/src/common/theme';
import type { ComponentProps } from 'react';
import Animated from 'react-native-reanimated';
import { useIdentityHandle } from './hooks/useIdentityHandle';

const AnimatedText = Animated.createAnimatedComponent(Text);

type IdentityHandleProps = Omit<ComponentProps<typeof Text>, 'children'> & {
  identity: string | null | undefined;
  /** Links the handle to the profile. */
  linkToProfile?: boolean;
};

/** Every identity alias or shortened id in the app renders through this. */
export function IdentityHandle({
  identity,
  linkToProfile = false,
  variant = 'secondary',
  color = 'muted',
  numberOfLines = 1,
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
      numberOfLines={numberOfLines}
      monospace={handle.kind === 'hash'}
      style={[
        style,
        styles.handle,
        handle.kind === 'alias-pending' && styles.handlePending,
      ]}
    >
      {linkToProfile && identity ? (
        <InlineLink
          href={Routes.tabs.profile(identity)}
          underlineOnHover={false}
        >
          {handle.text}
        </InlineLink>
      ) : (
        handle.text
      )}
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
    handlePending: Atoms.faded,
  }),
);
