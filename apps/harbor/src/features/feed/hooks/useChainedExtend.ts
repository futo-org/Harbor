import { shouldExtend } from '@/src/common/lib/polycentric-hooks';
import type { UseQueryResult } from '@/src/common/query/hooks/useQuery';
import { QueryStatus } from '@polycentric/react-native';
import { useEffect, useRef } from 'react';

const MIN_REVEAL = 8;
const MAX_ROUNDS = 3;

/**
 * Extend a feed until at least `MIN_REVEAL` new items surface. The
 * multi-server pagination horizon can make a single extend reveal only
 * an item or two, so a load-more chains up to `MAX_ROUNDS` fan-outs.
 */
export function useChainedExtend(
  query: UseQueryResult,
  itemCount: number,
  hasNext: boolean,
): () => void {
  const roundsLeft = useRef(0);
  const baseCount = useRef(0);

  useEffect(() => {
    if (roundsLeft.current <= 0) return;
    if (query.status === QueryStatus.Loading) return;
    if (
      itemCount - baseCount.current >= MIN_REVEAL ||
      !hasNext ||
      query.successfulServers === 0
    ) {
      roundsLeft.current = 0;
      return;
    }
    roundsLeft.current -= 1;
    query.extend();
  }, [query, itemCount, hasNext]);

  return () => {
    if (!shouldExtend(hasNext, query)) return;
    roundsLeft.current = MAX_ROUNDS;
    baseCount.current = itemCount;
    query.extend();
  };
}
