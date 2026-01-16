import { useQuery } from '@tanstack/react-query';
import { getWalletProfile } from '../api';

export function useWalletProfile(address: string) {
  return useQuery({
    queryKey: ['wallet-profile', address],
    queryFn: () => getWalletProfile(address),
    enabled: !!address && address.length >= 32,
    staleTime: 120000, // 2 minutes
    retry: 1,
  });
}
