import { useQuery } from '@tanstack/react-query';
import type { Timeframe } from '@solana-pnl/shared';
import { getProfitableWallets } from '../api';

export function useProfitableWallets(options: {
  timeframe?: Timeframe;
  minTrades?: number;
  minVolume?: number;
  minWinRate?: number;
  limit?: number;
} = {}) {
  return useQuery({
    queryKey: ['profitable-wallets', options],
    queryFn: () => getProfitableWallets(options),
    staleTime: 120000,
    retry: 1,
  });
}
