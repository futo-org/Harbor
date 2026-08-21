import { Button } from '@/src/common/components';
import { TabFilterSheet, Tabs } from '@/src/common/components/tabs';
import { Atoms } from '@/src/common/theme';
import { ClaimCreateSheet } from '@/src/features/verifications/claims/create/ClaimCreateSheet';
import { useState } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useProfile } from './hooks/useProfile';
import { useProfileContext, type ActiveFeed } from './ProfileContext';

type VerificationFeed = Extract<
  ActiveFeed,
  'verification-claims' | 'verification-verifies'
>;

/** Shared by the full and compact profile headers. */
export function ProfileTabs({
  progress,
}: {
  /** The pager's swipe position, so the indicator tracks the drag. */
  progress?: SharedValue<number>;
}) {
  const { activeFeed, setActiveFeed, identityKey, isSelf } =
    useProfileContext();

  // What the Verifications tab opens; the live feed wins while on one so
  // swipes keep the menu in sync.
  const [lastVerificationFeed, setLastVerificationFeed] =
    useState<VerificationFeed>('verification-claims');
  const verificationFeed =
    activeFeed === 'posts' ? lastVerificationFeed : activeFeed;

  // Own profile creates claims; other profiles request a verification.
  const showClaimAction = isSelf || !!identityKey;
  const [claimSheetOpen, setClaimSheetOpen] = useState(false);

  const profile = useProfile(identityKey);
  const name = isSelf ? 'you' : (profile.name ?? 'this profile');

  return (
    <>
      <Tabs progress={progress}>
        <Tabs.Tab
          active={activeFeed === 'posts'}
          onPress={() => setActiveFeed('posts')}
        >
          Posts
        </Tabs.Tab>
        <Tabs.Tab
          active={activeFeed !== 'posts'}
          onPress={() => setActiveFeed(verificationFeed)}
          menu={({ open, onClose }) => (
            <TabFilterSheet
              open={open}
              onClose={onClose}
              title="Verifications"
              detents={[0.4]}
              options={[
                {
                  label: 'Claims',
                  subtitle: `Claims made by ${name}.`,
                  value: 'verification-claims',
                  icon: 'verify',
                },
                {
                  label: `Verified by ${name}`,
                  subtitle: isSelf
                    ? 'Claims by others that you have verified.'
                    : `Claims by others that ${name} has verified.`,
                  value: 'verification-verifies',
                  icon: 'checkmark',
                },
              ]}
              selected={verificationFeed}
              onChange={(next: VerificationFeed) => {
                setLastVerificationFeed(next);
                setActiveFeed(next);
                onClose();
              }}
            >
              {showClaimAction ? (
                <View style={[Atoms.px_lg, Atoms.pt_md]}>
                  <Button
                    title={isSelf ? 'Create a claim' : 'Request a verification'}
                    fullWidth
                    onPress={() => {
                      onClose();
                      setClaimSheetOpen(true);
                    }}
                  />
                </View>
              ) : null}
            </TabFilterSheet>
          )}
        >
          Verifications
        </Tabs.Tab>
      </Tabs>
      {showClaimAction ? (
        <ClaimCreateSheet
          open={claimSheetOpen}
          onClose={() => setClaimSheetOpen(false)}
          requestFrom={isSelf ? undefined : (identityKey ?? undefined)}
        />
      ) : null}
    </>
  );
}
