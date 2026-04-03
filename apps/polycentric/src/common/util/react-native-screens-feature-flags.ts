import { featureFlags } from 'react-native-screens';

/**
 * @see https://github.com/software-mansion/react-native-screens/issues/2559
 */
const experiment = featureFlags.experiment;

if ('iosPreventReattachmentOfDismissedScreens' in experiment) {
  (
    experiment as {
      iosPreventReattachmentOfDismissedScreens: boolean;
    }
  ).iosPreventReattachmentOfDismissedScreens = true;
}
