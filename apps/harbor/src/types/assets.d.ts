declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';
  const value: ImageSourcePropType;
  export default value;
}

// No svg transformer is configured, so metro treats .svg as a plain asset and
// the import is an image source, same as a .png.
declare module '*.svg' {
  import type { ImageSourcePropType } from 'react-native';
  const value: ImageSourcePropType;
  export default value;
}
