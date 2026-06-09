import { ListItem, Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Screen } from '@/src/common/components/layout';
import Topbar from '@/src/common/components/layout/Topbar';
import { ScrollView } from '@/src/common/components/ScrollView';
import { Atoms, useTheme } from '@/src/common/theme';
import { View } from 'react-native';

export default function VerifyScreen() {
  const { theme } = useTheme();
  return (
    <Screen>
      <Screen.PrimaryColumn>
        <ScrollView
          HeaderComponent={() => <Topbar title="Verify" />}
          showsVerticalScrollIndicator={false}
        >
          <View style={[Atoms.p_lg, Atoms.gap_lg, Atoms.flex_row]}>
            <View style={[Atoms.flex_1]}>
              <ListItem onPress={() => {}}>
                <View
                  style={[
                    Atoms.flex_row,
                    Atoms.align_center,
                    Atoms.gap_md,
                    Atoms.pl_xs,
                  ]}
                >
                  <Icon name={'addOutline'} size={22} color={'neutral_600'} />
                  <View style={Atoms.flex_1}>
                    <Text variant="subtitle" style={theme.atoms.text}>
                      Create a claim
                    </Text>
                    {/* <Text variant="body" style={theme.atoms.text}>
                      {
                        'Submit a new claim to your network, such as "I work at XYZ"'
                      }
                    </Text> */}
                  </View>
                </View>
              </ListItem>
            </View>

            <View style={[Atoms.flex_1]}>
              <ListItem onPress={() => {}}>
                <View
                  style={[
                    Atoms.flex_row,
                    Atoms.align_center,
                    Atoms.gap_md,
                    Atoms.pl_xs,
                  ]}
                >
                  <Icon name={'verify'} size={22} color={'neutral_600'} />
                  <View style={Atoms.flex_1}>
                    <Text variant="subtitle" style={theme.atoms.text}>
                      Verify a claim
                    </Text>
                    {/* <Text variant="body" style={theme.atoms.text}>
                      {
                        'Submit a new claim to your network, such as "I work at XYZ"'
                      }
                    </Text> */}
                  </View>
                </View>
              </ListItem>
            </View>
          </View>
        </ScrollView>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
