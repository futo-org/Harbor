import { createContext, type RefObject, useContext } from 'react';
import type { ViewInstance } from 'react-native';

// A portal host inside the native sheet. Native sheets are presented above
// the app's root PortalHost, so overlays opened from a sheet render here.
export const SheetPortalHostContext = createContext<{
  name: string;
  ref: RefObject<ViewInstance | null>;
} | null>(null);

/** The enclosing native sheet's portal host, or null outside one. */
export function useSheetPortalHost() {
  return useContext(SheetPortalHostContext);
}
