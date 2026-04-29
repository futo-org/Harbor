import { create } from 'zustand';
import {
  COLLECTION,
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
    force?: boolean,
  ) => Promise<void>;
};

const inflight = new Map<string, Promise<void>>();

const useProfiles = create<ProfilesState>((set, get) => ({
  profiles: new Map(),

  setProfile(data) {
    const profiles = new Map(get().profiles);
    profiles.set(data.identifier, data);
    set({ profiles });
  },

  fetchProfile(client, identityKey, force = false) {
    if (!identityKey) return Promise.resolve();
    if (client.servers.length === 0) return Promise.resolve();

    const existing = get().profiles.get(identityKey);
    if (!force && existing && !existing.error) return Promise.resolve();

    const pending = inflight.get(identityKey);
    if (pending) return pending;

    const prev = existing ?? emptyProfile(identityKey);
    get().setProfile({ ...prev, isLoading: true, error: null });

    const promise = (async () => {
      try {
        const bundles = await client.listEvents({
          identity: identityKey,
          collection: COLLECTION.PROFILE,
        });

        const updates: { sequence: bigint; update: v2.ProfileUpdate }[] = [];
        for (const bundle of bundles) {
          if (!bundle.signedEvent || !bundle.serializedContent?.contentBytes) {
            continue;
          }
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

        const merged = emptyProfile(identityKey);
        for (const { update } of updates) {
          if (update.name !== undefined) merged.name = update.name;
          if (update.description !== undefined) {
            merged.description = update.description;
          }
          if (update.avatar !== undefined) merged.avatar = update.avatar;
          if (update.banner !== undefined) merged.banner = update.banner;
        }

        get().setProfile({ ...merged, isLoading: false, error: null });
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        const cur =
          get().profiles.get(identityKey) ?? emptyProfile(identityKey);
        get().setProfile({ ...cur, isLoading: false, error });
      } finally {
        inflight.delete(identityKey);
      }
    })();

    inflight.set(identityKey, promise);
    return promise;
  },
}));

export default useProfiles;
