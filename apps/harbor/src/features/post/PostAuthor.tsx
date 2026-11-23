import { Atoms, createThemedStyles } from '@/src/common/theme';
import { useIdentityHandle } from '@/src/features/profile/hooks/useIdentityHandle';
import { IdentityHandle } from '@/src/features/profile/IdentityHandle';
import { Username } from '@/src/features/profile/Username';
import { type StyleProp, View, type ViewStyle } from 'react-native';

type PostAuthorProps = {
  identity: string | null;
  // Puts the handle under the name instead of after it
  stacked?: boolean;
};

/** The author's name and handle, both linked to their profile. */
export function PostAuthor({ stacked = false, ...props }: PostAuthorProps) {
  return stacked ? (
    <StackedNameAndHandle {...props} />
  ) : (
    <InlineNameAndHandle {...props} />
  );
}

function StackedNameAndHandle({ identity }: PostAuthorProps) {
  return (
    <>
      <AuthorName identity={identity} style={Atoms.flex_shrink_1} />
      {identity ? (
        <View style={Atoms.self_start}>
          <IdentityHandle identity={identity} linkToProfile />
        </View>
      ) : null}
    </>
  );
}

function InlineNameAndHandle({ identity }: PostAuthorProps) {
  const styles = useStyles();
  const isHandleHash = useIdentityHandle(identity).kind === 'hash';

  return (
    <>
      <AuthorName
        identity={identity}
        style={isHandleHash ? styles.nameBeforeHash : styles.nameBeforeAlias}
      />
      {identity ? (
        <IdentityHandle
          identity={identity}
          linkToProfile
          style={isHandleHash ? styles.hash : styles.alias}
        />
      ) : null}
    </>
  );
}

function AuthorName({
  identity,
  style,
}: {
  identity: string | null;
  style: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <Username
        identity={identity}
        linkToProfile
        variant="secondary"
        fontWeight="bold"
      />
    </View>
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
