import StorybookUIRoot from '@/.rnstorybook';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';

export default function StorybookScreen() {
  usePageTitle('Storybook');

  return <StorybookUIRoot />;
}
