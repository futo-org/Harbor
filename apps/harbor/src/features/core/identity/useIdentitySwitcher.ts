import { toast } from '@/src/common/components/toast';
import { Routes } from '@/src/common/constants';
import { bytesToHex, usePolycentric } from '@/src/common/lib/polycentric-hooks';
import type {
  LoginId,
  LoginOverview,
  LoginStatus,
  PolycentricClient,
} from '@polycentric/react-native';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { create } from 'zustand';

/** The data backing a row to display in the switcher. */
export type IdentityRow = {
  identity: string;
  login: LoginId;
};

/** Used when selecting between multiple logins for the same identity. */
const LOGIN_POWER: Partial<Record<LoginStatus, number>> = {
  liveSigningKey: 1,
  liveRotationKey: 2,
};

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Orders logins by (identity, key type, public key bytes). */
function compareLogins(a: LoginId, b: LoginId): number {
  return (
    compareStrings(a.identity, b.identity) ||
    a.publicKey.keyType - b.publicKey.keyType ||
    compareStrings(bytesToHex(a.publicKey.key), bytesToHex(b.publicKey.key))
  );
}

/**
 * Derive the rows to display in the identity switcher.
 * We use a deterministic order and only show one login per identity.
 */
export function deriveIdentityRows(
  logins: LoginOverview[],
  active: LoginId | null,
): IdentityRow[] {
  const sorted = [...logins].sort(compareLogins);

  // Collect the best login for each identity
  const loginMap = new Map<string, { login: LoginId; power: number }>();

  for (const login of sorted) {
    // Keep only logins with a relevant power
    const power = LOGIN_POWER[login.status];
    if (power === undefined) continue;

    // Skip logins where we already found one with equal or greater power
    const current = loginMap.get(login.identity);
    if (current && current.power >= power) continue;

    // Include this login
    loginMap.set(login.identity, {
      login: { identity: login.identity, publicKey: login.publicKey },
      power,
    });
  }

  // Ensure the active login is always listed
  if (active && !loginMap.has(active.identity)) {
    loginMap.set(active.identity, { login: active, power: 0 });
  }

  // Return a list with a deterministic order
  return [...loginMap.values()]
    .map(({ login }) => ({ identity: login.identity, login }))
    .sort((a, b) => compareStrings(a.identity, b.identity));
}

/** The current display mode of the sheet. */
export type IdentitySwitcherMode = 'closed' | 'switching' | 'adding';

type IdentitySwitcherState = {
  mode: IdentitySwitcherMode;

  /**
   * Cached rows from the most recent refresh.
   */
  rows: IdentityRow[] | null;

  /** Set to the new identity when an active switch is in progress. */
  switchingIdentity: string | null;

  /** Open the sheet and refresh the rows. */
  openWith: (client: PolycentricClient) => void;

  close: () => void;

  /** Toggle whether the sheet is switching identities or adding an identity. */
  toggleMode: () => void;

  /** Switch the active login and close the sheet. */
  switchTo: (client: PolycentricClient, login: LoginId) => Promise<void>;
};

export const useIdentitySwitcherStore = create<IdentitySwitcherState>(
  (set, get) => {
    return {
      mode: 'closed',
      rows: null,
      switchingIdentity: null,

      openWith: (client) => {
        set({ mode: 'switching' });

        void (async () => {
          try {
            // Derive active login
            const identity = client.activeIdentityKey;
            const publicKey = client.currentKeyPair?.publicKey;
            const active =
              identity && publicKey ? { identity, publicKey } : null;

            // Get all logins
            const logins = await client.storage.logins.listLogins();

            // Update rows
            set({ rows: deriveIdentityRows(logins, active) });
          } catch (e) {
            console.warn('IdentitySwitcher: failed to load logins:', e);
          }
        })();
      },

      close: () => set({ mode: 'closed' }),

      toggleMode: () => {
        const { mode } = get();
        if (mode === 'closed') return;
        set({ mode: mode === 'switching' ? 'adding' : 'switching' });
      },

      switchTo: async (client, login) => {
        // Guard against concurrent switches
        if (get().switchingIdentity !== null) return;
        set({ switchingIdentity: login.identity });

        // Do identity switch
        try {
          await client.loginAs(login);

          get().close();

          // Dismiss pages since they may contain stale data from the old
          // identity.
          if (router.canDismiss()) router.dismissAll();
          router.replace(Routes.tabs.feed.index);
        } catch (e) {
          console.warn('IdentitySwitcher: failed to switch identity:', e);
          toast.error('Failed to switch identity');
        } finally {
          set({ switchingIdentity: null });
        }
      },
    };
  },
);

/**
 * The public-facing API of the identity switcher.
 */
export function useIdentitySwitcher(): {
  isOpen: boolean;
  open: () => void;
  close: () => void;
} {
  const client = usePolycentric();
  const isOpen = useIdentitySwitcherStore((state) => state.mode !== 'closed');
  const openWith = useIdentitySwitcherStore((state) => state.openWith);
  const close = useIdentitySwitcherStore((state) => state.close);

  return useMemo(
    () => ({ isOpen, open: () => openWith(client), close }),
    [isOpen, openWith, client, close],
  );
}
