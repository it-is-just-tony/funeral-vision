import type { Trade, WalletProfile } from '@funeral-vision/shared';
import { tokenLaunchQueries } from '../db/index.js';
import { getTradesForWallet } from './pnl.js';

interface TokenLaunchRecord {
  mint: string;
  first_signature: string | null;
  first_timestamp: number | null;
  first_slot: number | null;
  source?: string | null;
}

// Cache launch data to avoid re-parsing the entire transactions table on every call
let launchCache: Map<string, TokenLaunchRecord> | null = null;

/**
 * Rebuild token_launches cache from stored raw transactions (no network/API calls)
 */
function refreshTokenLaunchCache(): Map<string, TokenLaunchRecord> {
  if (launchCache) return launchCache;

  const rows = tokenLaunchQueries.getAllLaunches.all() as TokenLaunchRecord[];
  const cached: Map<string, TokenLaunchRecord> = new Map();

  for (const row of rows) {
    cached.set(row.mint, row);
  }

  launchCache = cached;
  return cached;
}

function percentile(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

/**
 * Build a behavior profile for a wallet using cached trades and locally stored raw tx
 */
export function buildWalletProfile(walletAddress: string): WalletProfile {
  const trades = getTradesForWallet(walletAddress, 'all');
  const tokensTracked = new Set(trades.map(t => t.tokenMint)).size;

  // Keep the token launch cache fresh from local data
  const launchMap = refreshTokenLaunchCache();

  const dexBreakdown: Record<string, number> = {};
  const entryLatencies: number[] = [];
  const holdDurations: number[] = [];

  let totalSolVolume = 0;
  let roundTripTokens = 0;
  let earlyExits = 0;
  let tokensWithSells = 0;

  // Group trades by token
  const byToken: Map<string, Trade[]> = new Map();
  for (const trade of trades) {
    totalSolVolume += trade.solAmount;
    dexBreakdown[trade.dex] = (dexBreakdown[trade.dex] || 0) + 1;

    const arr = byToken.get(trade.tokenMint) || [];
    arr.push(trade);
    byToken.set(trade.tokenMint, arr);
  }

  for (const [, tokenTrades] of byToken) {
    const sorted = [...tokenTrades].sort((a, b) => a.timestamp - b.timestamp);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    // Entry latency relative to first-seen in cached data
    const launch = launchMap.get(first.tokenMint) as TokenLaunchRecord | undefined;
    if (launch?.first_timestamp != null && first.timestamp >= launch.first_timestamp) {
      entryLatencies.push(first.timestamp - launch.first_timestamp);
    }

    const hasBuy = sorted.some(t => t.type === 'buy');
    const hasSell = sorted.some(t => t.type === 'sell');

    if (hasBuy && hasSell) {
      roundTripTokens++;
      tokensWithSells++;
      holdDurations.push(Math.max(0, last.timestamp - first.timestamp));

      const firstSell = sorted.find(t => t.type === 'sell');
      if (firstSell) {
        const timeToFirstSell = firstSell.timestamp - first.timestamp;
        if (timeToFirstSell <= QUICK_FLIP_SECONDS) {
          earlyExits++;
        }
      }
    } else if (hasSell) {
      tokensWithSells++;
    }
  }

  entryLatencies.sort((a, b) => a - b);
  holdDurations.sort((a, b) => a - b);

  const profile: WalletProfile = {
    address: walletAddress,
    tokensTracked,
    totalTrades: trades.length,
    totalSolVolume,
    dexBreakdown,
    entryLatencySeconds: entryLatencies.length
      ? {
          p50: percentile(entryLatencies, 50) ?? 0,
          p90: percentile(entryLatencies, 90) ?? 0,
          sampleSize: entryLatencies.length,
        }
      : undefined,
    holdDurationsSeconds: holdDurations.length
      ? {
          median: percentile(holdDurations, 50) ?? 0,
          p90: percentile(holdDurations, 90) ?? 0,
          sampleSize: holdDurations.length,
        }
      : undefined,
    earlyExitRate: tokensWithSells > 0 ? earlyExits / tokensWithSells : undefined,
    roundTripRate: tokensTracked > 0 ? roundTripTokens / tokensTracked : undefined,
  };

  return profile;
}
// Consider "quick flip" if first sell happens within this many seconds of first buy
const QUICK_FLIP_SECONDS = 600; // 10 minutes
