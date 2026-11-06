import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, createThemedStyles } from '@/src/common/theme';
import { useIdentityHandle } from '@/src/features/profile/hooks/useIdentityHandle';
import { IdentityHandle } from '@/src/features/profile/IdentityHandle';
import { Username } from '@/src/features/profile/Username';
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native';

type PostAuthorNameAndHandleProps = {
  identity: string | null;
  onNamePress?: () => void;
  // Puts the handle under the name instead of after it
  stacked?: boolean;
};

export function PostAuthorNameAndHandle({
  stacked = false,
  ...props
}: PostAuthorNameAndHandleProps) {
  return stacked ? (
    <StackedNameAndHandle {...props} />
  ) : (
    <InlineNameAndHandle {...props} />
  );
}

function StackedNameAndHandle({
  identity,
  onNamePress,
}: PostAuthorNameAndHandleProps) {
  return (
    <>
      <AuthorName
        identity={identity}
        onPress={onNamePress}
        style={Atoms.flex_shrink_1}
      />
      {identity ? (
        <View style={Atoms.self_start}>
          <IdentityHandle identity={identity} />
        </View>
      ) : null}
    </>
  );
}

function InlineNameAndHandle({
  identity,
  onNamePress,
}: PostAuthorNameAndHandleProps) {
  const styles = useStyles();
  const isHandleHash = useIdentityHandle(identity).kind === 'hash';

  return (
    <>
      <AuthorName
        identity={identity}
        onPress={onNamePress}
        style={isHandleHash ? styles.nameBeforeHash : styles.nameBeforeAlias}
      />
      {identity ? (
        <IdentityHandle
          identity={identity}
          style={isHandleHash ? styles.hash : styles.alias}
        />
      ) : null}
    </>
  );
}

function AuthorName({
  identity,
  onPress,
  style,
}: {
  identity: string | null;
  onPress?: () => void;
  style: StyleProp<ViewStyle>;
}) {
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      style={style}
    >
      <Username
        identity={identity}
        variant="secondary"
        fontWeight="bold"
        style={hovered && onPress && Atoms.text_underline}
      />
    </Pressable>
  );
}

const useStyles = createThemedStyles((_, define) =>
  define({
    nameBeforeHash: Atoms.flex_shrink_1,
    hash: Atoms.flex_shrink_0,
    // Keeps its full width up to the cap: the alias ellipsizes first
    nameBeforeAlias: [Atoms.flex_shrink_0, { maxWidth: '66%' }],
    alias: Atoms.flex_shrink_1,
  }),
);
