import AsyncStorage from '@react-native-async-storage/async-storage';
import { view } from './storybook.requires';

// Outside the dev variant, withStorybook swaps this file for its own stub
const StorybookUIRoot = view.getStorybookUI({
  storage: {
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
  },
});

export default StorybookUIRoot;
