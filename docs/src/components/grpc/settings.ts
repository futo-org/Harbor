import { createContext, useContext } from 'react';

export type Settings = {
  /** Base URL requests are sent to. */
  server: string;
  /** Value of the `authorization` header, empty for none. */
  authorization: string;
  serverChoice: string;
  customServer: string;
  setServerChoice: (value: string) => void;
  setCustomServer: (value: string) => void;
  setAuthorization: (value: string) => void;
};

export const SettingsContext = createContext<Settings>({
  server: '',
  authorization: '',
  serverChoice: '',
  customServer: '',
  setServerChoice: () => {},
  setCustomServer: () => {},
  setAuthorization: () => {},
});

export function useSettings(): Settings {
  return useContext(SettingsContext);
}
