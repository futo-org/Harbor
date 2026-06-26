import { Text } from '@/src/common/components';
import { List } from '@/src/common/components/List';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { View } from 'react-native';
import { DecodedClaim } from '../hooks/useClaimById';
import { useClaimsList } from '../hooks/useClaimsList';
import { ClaimListItem } from './ClaimListItem';

// The current identity's created claims.
export function ClaimList() {
  const { theme } = useTheme();
  const { identityKey } = useCurrentIdentity();
  const { claims } = useClaimsList(identityKey ?? undefined);

  return (
    <List<DecodedClaim>
      data={claims}
      keyExtractor={(claim) => `${claim.keyFingerprint}-${claim.sequence}`}
      renderItem={({ item }) => (
        <View style={Atoms.pb_sm}>
          <ClaimListItem claim={item} />
        </View>
      )}
      ListEmptyComponent={
        <Text variant="body" style={theme.atoms.text_neutral_medium}>
          You haven&apos;t created any claims yet.
        </Text>
      }
    />
  );
}
