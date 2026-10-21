import { Routes } from '@/src/common/constants';
import { Redirect } from 'expo-router';

// Not a real screen: it exists only because the iOS tab bar's compose button
// doesn't render without a route behind it. The button opens /feed/compose
// instead (see the tabs layout). Direct visit here just redirects home.
export default function ComposeTabRedirect() {
  return <Redirect href={Routes.tabs.feed.index} />;
}
