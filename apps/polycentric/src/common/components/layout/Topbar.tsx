import { Link } from 'expo-router';
import { View } from 'react-native';
import { Atoms } from '../../theme';
import { Image } from 'expo-image';
import WEB_LOGO from '../../assets/images/WebLogo.png';

export default function Topbar() {
  return (
    <View style={[Atoms.w_full, Atoms.align_center, Atoms.flex_col]}>
      <Link
        href="/"
        style={[
          Atoms.py_lg,
          Atoms.flex,
          Atoms.align_center,

          Atoms.justify_center,
        ]}
      >
        <Image
          source={WEB_LOGO}
          contentFit="contain"
          style={{ width: 30, height: 30 }}
        />
      </Link>
    </View>
  );
}
