import { StrictMode } from 'react';
import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
import { PolycentricProvider } from './src/hooks';
import { PlaceholderLogo } from './src/components/PlaceholderLogo';

function Root() {
  return (
    <StrictMode>
      <PolycentricProvider loadingComponent={<PlaceholderLogo />}>
        <App />
      </PolycentricProvider>
    </StrictMode>
  );
}

AppRegistry.registerComponent(appName, () => Root);
