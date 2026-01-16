import type { PnLSummary, Timeframe, Trade, Position, WalletProfile, WalletRanking } from '@funeral-vision/shared';

const API_BASE = '/api';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TradesResponse {
  trades: Trade[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PositionsResponse {
  positions: Position[];
}

export interface WalletStatus {
  address: string;
  isSyncing: boolean;
  lastSyncedAt?: number;
  totalTransactions: number;
}

export type { WalletProfile } from '@funeral-vision/shared';
export type { WalletRanking } from '@funeral-vision/shared';

/**
 * Analyze a wallet and get PnL summary
 */
export async function analyzeWallet(
  address: string,
  timeframe: Timeframe = 'all',
  refresh = false
): Promise<PnLSummary> {
  const params = new URLSearchParams({ timeframe });
  if (refresh) params.set('refresh', 'true');

  const response = await fetch(`${API_BASE}/wallet/${address}/analyze?${params}`);
  const result: ApiResponse<PnLSummary> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to analyze wallet');
  }

  return result.data;
}

/**
 * Get trades for a wallet
 */
export async function getTrades(
  address: string,
  timeframe: Timeframe = 'all',
  page = 1,
  pageSize = 50
): Promise<TradesResponse> {
  const params = new URLSearchParams({
    timeframe,
    page: page.toString(),
    pageSize: pageSize.toString(),
  });

  const response = await fetch(`${API_BASE}/wallet/${address}/trades?${params}`);
  const result: ApiResponse<TradesResponse> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to fetch trades');
  }

  return result.data;
}

/**
 * Get positions for a wallet
 */
export async function getPositions(address: string): Promise<Position[]> {
  const response = await fetch(`${API_BASE}/wallet/${address}/positions`);
  const result: ApiResponse<PositionsResponse> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to fetch positions');
  }

  return result.data.positions;
}

/**
 * Get wallet sync status
 */
export async function getWalletStatus(address: string): Promise<WalletStatus> {
  const response = await fetch(`${API_BASE}/wallet/${address}/status`);
  const result: ApiResponse<WalletStatus> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to fetch wallet status');
  }

  return result.data;
}

export interface TokenMetadata {
  symbol: string | null;
  name: string | null;
  image: string | null;
}

/**
 * Get metadata for multiple tokens
 */
export async function getTokenMetadata(
  mints: string[]
): Promise<Record<string, TokenMetadata>> {
  if (mints.length === 0) return {};

  const response = await fetch(`${API_BASE}/wallet/tokens/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mints }),
  });
  const result: ApiResponse<Record<string, TokenMetadata>> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to fetch token metadata');
  }

  return result.data;
}

/**
 * Get behavior profile for a wallet (offline computation on cached data)
 */
export async function getWalletProfile(address: string): Promise<WalletProfile> {
  const response = await fetch(`${API_BASE}/wallet/${address}/profile`);
  const result: ApiResponse<WalletProfile> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to fetch wallet profile');
  }

  return result.data;
}

/**
 * Get ranked profitable wallets (cached data only)
 */
export async function getProfitableWallets(params: {
  timeframe?: Timeframe;
  minTrades?: number;
  minVolume?: number;
  minWinRate?: number;
  limit?: number;
} = {}): Promise<WalletRanking[]> {
  const searchParams = new URLSearchParams();
  if (params.timeframe) searchParams.set('timeframe', params.timeframe);
  if (params.minTrades !== undefined) searchParams.set('minTrades', String(params.minTrades));
  if (params.minVolume !== undefined) searchParams.set('minVolume', String(params.minVolume));
  if (params.minWinRate !== undefined) searchParams.set('minWinRate', String(params.minWinRate));
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));

  const response = await fetch(`${API_BASE}/wallet/discovery/profitable?${searchParams.toString()}`);
  const result: ApiResponse<WalletRanking[]> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to fetch profitable wallets');
  }

  return result.data;
}

/**
 * Calculate follow scores for all wallets
 */
export async function calculateFollowScores(params: {
  delaySeconds?: number;
  slippageModel?: 'conservative' | 'moderate' | 'aggressive';
} = {}): Promise<{ scored: number }> {
  const response = await fetch(`${API_BASE}/wallet/follow-score/calculate-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      delaySeconds: params.delaySeconds ?? 5,
      slippageModel: params.slippageModel ?? 'moderate',
    }),
  });
  const result: ApiResponse<{ scored: number }> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to calculate follow scores');
  }

  return result.data;
}

// ============ CATALOG API ============

import type { CatalogWallet, WalletImportPayload, AggregatedStats } from '@funeral-vision/shared';

export interface ImportResult {
  imported: number;
  failed: number;
  failedDetails: { address: string; error: string }[];
}

export interface RefreshResult {
  total: number;
  successful: number;
  failed: number;
  results: { address: string; success: boolean; error?: string; trades?: number }[];
}

/**
 * Get all wallets in the catalog
 */
export async function getCatalogWallets(userId = 'default'): Promise<CatalogWallet[]> {
  const response = await fetch(`${API_BASE}/wallet/catalog/list?userId=${userId}`);
  const result: ApiResponse<CatalogWallet[]> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to fetch catalog');
  }

  return result.data;
}

/**
 * Import wallets from JSON format
 */
export async function importWallets(
  wallets: WalletImportPayload[],
  userId = 'default'
): Promise<ImportResult> {
  const response = await fetch(`${API_BASE}/wallet/catalog/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallets, userId }),
  });
  const result: ApiResponse<ImportResult> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to import wallets');
  }

  return result.data;
}

/**
 * Delete a wallet from the catalog
 */
export async function deleteWallet(address: string, userId = 'default'): Promise<void> {
  const response = await fetch(`${API_BASE}/wallet/catalog/${address}?userId=${userId}`, {
    method: 'DELETE',
  });
  const result: ApiResponse<{ deleted: string }> = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Failed to delete wallet');
  }
}

/**
 * Update wallet metadata
 */
export async function updateWalletMetadata(
  address: string,
  data: { name?: string; emoji?: string; alertsOn?: boolean },
  userId = 'default'
): Promise<void> {
  const response = await fetch(`${API_BASE}/wallet/catalog/${address}?userId=${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<{ updated: string }> = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Failed to update wallet');
  }
}

/**
 * Analyze multiple wallets and get aggregated stats
 */
export async function bulkAnalyzeWallets(
  addresses: string[],
  timeframe: Timeframe = 'all',
  userId = 'default'
): Promise<AggregatedStats> {
  const response = await fetch(`${API_BASE}/wallet/catalog/bulk-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses, timeframe, userId }),
  });
  const result: ApiResponse<AggregatedStats> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to analyze wallets');
  }

  return result.data;
}

/**
 * Refresh data for selected wallets
 * @param forceRefresh - If true, re-fetches all transactions. If false (default), only fetches new ones.
 */
export async function refreshSelectedWallets(
  addresses: string[],
  userId = 'default',
  forceRefresh = false
): Promise<RefreshResult> {
  const response = await fetch(`${API_BASE}/wallet/catalog/refresh-selected`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses, userId, forceRefresh }),
  });
  const result: ApiResponse<RefreshResult> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to refresh wallets');
  }

  return result.data;
}
