import { createContext, useContext } from 'react';

// Options the create-claim flow was opened with, provided by ClaimCreateSheet.
export interface ClaimCreateOptions {
  // Identity to request verification from once the claim is created.
  requestFrom?: string;
}

const Context = createContext<ClaimCreateOptions>({});

export const ClaimCreateProvider = Context.Provider;

export function useClaimCreateOptions(): ClaimCreateOptions {
  return useContext(Context);
}
