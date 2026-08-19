import { useEffect, useState, type ComponentProps } from 'react';
import { RefreshControl } from 'react-native';

type PullRefreshControlProps = Omit<
  ComponentProps<typeof RefreshControl>,
  'refreshing'
> & {
  /** True while any refresh is in flight, not just pull-started ones. */
  refreshing: boolean;
};

/** A `RefreshControl` that only spins for a refresh its own pull started;
 *  refreshes triggered elsewhere (nav re-taps) stay silent. */
export function PullRefreshControl({
  refreshing,
  onRefresh,
  ...rest
}: PullRefreshControlProps) {
  const [pulling, setPulling] = useState(false);
  useEffect(() => {
    if (!refreshing) setPulling(false);
  }, [refreshing]);

  return (
    <RefreshControl
      refreshing={pulling && refreshing}
      onRefresh={() => {
        setPulling(true);
        onRefresh?.();
      }}
      {...rest}
    />
  );
}
