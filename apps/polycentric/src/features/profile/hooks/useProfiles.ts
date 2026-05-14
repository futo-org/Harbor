import { create } from 'zustand';
import {
  FetchMode,
  Query,
  QueryStatus,
  type PolycentricClient,
} from '@polycentric/react-native';
import { decodeProfile, type DecodedProfile } from '../lib/decodeProfile';

export type ProfileData = DecodedProfile & {
  identifier: string;
  isLoading: boolean;
  error: Error | null;
};

export const emptyProfile = (identifier: string): ProfileData => ({
  identifier,
  name: null,
  description: null,
  avatar: null,
  banner: null,
  isLoading: false,
  error: null,
});

type Sub = { unsubscribe: () => void };

type ProfilesState = {
  profiles: Map<string, ProfileData>;
  fetch: (
    client: PolycentricClient,
    identityKey: string,
    fetchMode?: FetchMode,
  ) => void;
  refresh: (client: PolycentricClient, identityKey: string) => void;
};

const useProfiles = create<ProfilesState>((set, get) => {
  const writeProfile = (data: ProfileData) =>
    set((state) => {
      const next = new Map(state.profiles);
      next.set(data.identifier, data);
      return { profiles: next };
    });

  const subscribe = (
    client: PolycentricClient,
    identityKey: string,
    fetchMode: FetchMode,
  ) => {
    const observable = client.core.fetchQuery(
      ['profile', identityKey],
      new Query.GetProfile({ identity: identityKey }),
      { fetchMode },
    );
    let sub: Sub | null = null;
    sub = observable.subscribe({
      next: (result) => {
        const isLoading = result.status === QueryStatus.Loading;
        if (result.data) {
          writeProfile({
            identifier: identityKey,
            ...decodeProfile(result.data),
            isLoading,
            error: null,
          });
        } else {
          const cur =
            get().profiles.get(identityKey) ?? emptyProfile(identityKey);
          writeProfile({ ...cur, isLoading });
        }
      },
      error: (message: string) => {
        const cur =
          get().profiles.get(identityKey) ?? emptyProfile(identityKey);
        writeProfile({ ...cur, isLoading: false, error: new Error(message) });
        sub?.unsubscribe();
      },
      complete: () => {
        sub?.unsubscribe();
      },
    });
  };

  return {
    profiles: new Map(),

    fetch(client, identityKey, fetchMode = FetchMode.OfflineOnly) {
      if (!identityKey) return;
      if (
        fetchMode === FetchMode.OfflineOnly &&
        get().profiles.has(identityKey)
      ) {
        return;
      }
      subscribe(client, identityKey, fetchMode);
    },

    refresh(client, identityKey) {
      if (!identityKey) return;
      subscribe(client, identityKey, FetchMode.Default);
    },
  };
});

export default useProfiles;
