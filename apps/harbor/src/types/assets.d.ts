declare module '*.png' {
  import type { ImageURISource } from 'react-native';
  const value: number | ImageURISource;
  export default value;
}

declare module '*.svg' {
  import type { ImageURISource } from 'react-native';
  const value: number | ImageURISource;
  export default value;
}
