import { useQuery } from '@tanstack/react-query';
import type { Timeframe } from '@solana-pnl/shared';
import { analyzeWallet } from '../api';

export function useWalletPnL(address: string, timeframe: Timeframe = 'all') {
  return useQuery({
    queryKey: ['wallet-pnl', address, timeframe],
    queryFn: () => analyzeWallet(address, timeframe),
    enabled: !!address && address.length >= 32,
    staleTime: 60000, // 1 minute
    retry: 1,
  });
}
