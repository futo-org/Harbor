import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { ScrollView } from '@/src/common/components/ScrollView';
import { Atoms } from '@/src/common/theme';
import { View } from 'react-native';
import { ClaimCreate } from './claims/ClaimCreate';

// Standalone route for creating a claim. The content also appears inline on
// the main Verifications screen; this just wraps it in its own screen.
// Submitting navigates to the new claim's view (handled inside CreateClaim).
export default function VerificationsCreateClaimScreen() {
  return (
    <Screen>
      <Screen.PrimaryColumn>
        <ScrollView
          HeaderComponent={<Topbar title="Create a claim" />}
          showsVerticalScrollIndicator={false}
        >
          <View style={Atoms.p_lg}>
            <ClaimCreate />
          </View>
        </ScrollView>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
