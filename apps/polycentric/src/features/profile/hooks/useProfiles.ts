import { create } from 'zustand';
import {
  FetchMode,
  QueryStatus,
  v2,
  type PolycentricClient,
} from '@polycentric/react-native';

export type ProfileData = {
  identifier: string;
  name: string | null;
  description: string | null;
  avatar: v2.ImageSet | null;
  banner: v2.ImageSet | null;
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

type ProfilesState = {
  profiles: Map<string, ProfileData>;
  setProfile: (data: ProfileData) => void;
  fetchProfile: (
    client: PolycentricClient,
    identityKey: string,
    fetchMode?: FetchMode,
  ) => void;
};

function mergeProfile(
  identifier: string,
  bytes: ArrayBuffer | Uint8Array,
): Pick<
  ProfileData,
  'identifier' | 'name' | 'description' | 'avatar' | 'banner'
> {
  const response = v2.ListEventsResponse.fromBinary(
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
  );

  const updates: { sequence: bigint; update: v2.ProfileUpdate }[] = [];
  for (const bundle of response.eventBundles) {
    if (!bundle.signedEvent || !bundle.serializedContent?.contentBytes)
      continue;
    try {
      const event = v2.Event.fromBinary(bundle.signedEvent.eventBytes);
      if (!event.key) continue;
      const content = v2.Content.fromBinary(
        bundle.serializedContent.contentBytes,
      );
      if (content.contentBody.oneofKind !== 'profileUpdate') continue;
      updates.push({
        sequence: event.key.sequence,
        update: content.contentBody.profileUpdate,
      });
    } catch {
      continue;
    }
  }

  updates.sort((a, b) =>
    a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0,
  );

  const merged = emptyProfile(identifier);
  for (const { update } of updates) {
    if (update.name !== undefined) merged.name = update.name;
    if (update.description !== undefined)
      merged.description = update.description;
    if (update.avatar !== undefined) merged.avatar = update.avatar;
    if (update.banner !== undefined) merged.banner = update.banner;
  }

  return {
    identifier: merged.identifier,
    name: merged.name,
    description: merged.description,
    avatar: merged.avatar,
    banner: merged.banner,
  };
}

const useProfiles = create<ProfilesState>((set, get) => ({
  profiles: new Map(),

  setProfile(data) {
    const profiles = new Map(get().profiles);
    profiles.set(data.identifier, data);
    set({ profiles });
  },

  fetchProfile(client, identityKey, fetchMode = FetchMode.OfflineOnly) {
    if (!identityKey) return;

    // OfflineOnly: short-circuit on the React state. If we already
    // have an entry for this identity, that's whatever the rust local
    // event store last yielded — no point asking again. Other modes
    // always go through to rust so cached/network values can refresh.
    if (
      fetchMode === FetchMode.OfflineOnly &&
      get().profiles.has(identityKey)
    ) {
      return;
    }

    const prev = get().profiles.get(identityKey) ?? emptyProfile(identityKey);
    get().setProfile({ ...prev, isLoading: true, error: null });

    const observable = client.core.getProfile(identityKey, fetchMode);

    observable.subscribe({
      next: (result) => {
        const cur =
          get().profiles.get(identityKey) ?? emptyProfile(identityKey);
        if (result.data) {
          const merged = mergeProfile(identityKey, result.data);
          get().setProfile({
            ...merged,
            isLoading: result.status === QueryStatus.Loading,
            error: null,
          });
        } else {
          get().setProfile({
            ...cur,
            isLoading: result.status === QueryStatus.Loading,
          });
        }
      },
      error: (message: string) => {
        const cur =
          get().profiles.get(identityKey) ?? emptyProfile(identityKey);
        get().setProfile({
          ...cur,
          isLoading: false,
          error: new Error(message),
        });
      },
      complete: () => {
        const cur =
          get().profiles.get(identityKey) ?? emptyProfile(identityKey);
        get().setProfile({ ...cur, isLoading: false });
      },
    });
  },
}));

export default useProfiles;
