// Shown on docs/content/developer/declaring-your-application.md.

// #region rn-application
import { createPolycentricClient } from '@polycentric/react-native-sdk';
import * as Application from 'expo-application';

// #endregion rn-application

export async function createClientWithApplication() {
  // #region rn-application
  const client = await createPolycentricClient({
    application: {
      name: 'My App',
      id: Application.applicationId ?? 'com.example.myapp.web',
      version: Application.nativeApplicationVersion ?? '',
      url: 'https://myapp.example.com',
    },
  });
  // #endregion rn-application
  return client;
}
