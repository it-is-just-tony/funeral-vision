import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCatalogWallets, updateWalletMetadata } from '../api';
import type { CatalogWallet } from '@funeral-vision/shared';

interface UseCatalogWalletResult {
  wallet: CatalogWallet | null;
  isLoading: boolean;
  updateMeta: (data: { name?: string; emoji?: string }) => Promise<void>;
}

/**
 * Hook to get and update a single wallet's catalog metadata
 */
export function useCatalogWallet(address: string): UseCatalogWalletResult {
  const queryClient = useQueryClient();

  const { data: wallets = [], isLoading } = useQuery({
    queryKey: ['catalog-wallets'],
    queryFn: () => getCatalogWallets(),
    staleTime: 30000, // 30 seconds
  });

  const wallet = wallets.find((w) => w.address === address) || null;

  const updateMeta = async (data: { name?: string; emoji?: string }) => {
    await updateWalletMetadata(address, data);
    // Invalidate to refetch the catalog
    queryClient.invalidateQueries({ queryKey: ['catalog-wallets'] });
  };

  return { wallet, isLoading, updateMeta };
}
