import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { ScrollView } from '@/src/common/components/ScrollView';
import { Atoms } from '@/src/common/theme';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { CreateClaim } from './CreateClaim';

// Standalone route for creating a claim. The content also appears inline on
// the main Verifications screen; this just wraps it in its own screen.
export default function VerificationsCreateClaimScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <ScrollView
          HeaderComponent={<Topbar title="Create a claim" />}
          showsVerticalScrollIndicator={false}
        >
          <View style={Atoms.p_lg}>
            <CreateClaim onSubmitted={() => router.back()} />
          </View>
        </ScrollView>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
