import { useQuery } from '@tanstack/react-query';
import type { Timeframe } from '@funeral-vision/shared';
import { getTrades } from '../api';

export function useTrades(
  address: string,
  timeframe: Timeframe = 'all',
  page = 1,
  pageSize = 50
) {
  return useQuery({
    queryKey: ['wallet-trades', address, timeframe, page, pageSize],
    queryFn: () => getTrades(address, timeframe, page, pageSize),
    enabled: !!address && address.length >= 32,
    staleTime: 30000,
  });
}
