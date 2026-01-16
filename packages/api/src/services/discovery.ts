import type { Timeframe, WalletRanking } from '@funeral-vision/shared';
import { walletQueries, followScoreQueries } from '../db/index.js';

interface RankingOptions {
  timeframe?: Timeframe;
  minTrades?: number;
  minVolume?: number;
  minWinRate?: number;
  minFollowability?: number;  // Minimum followability ratio (0-1)
  limit?: number;
}

interface WalletRow {
  address: string;
  name: string | null;
  emoji: string | null;
  total_realized_pnl: number | null;
  win_rate: number | null;
  total_sol_volume: number | null;
  total_trades: number | null;
  quick_flip_rate: number | null;
  exited_token_rate: number | null;
}

interface FollowScoreRow {
  wallet_address: string;
  followability_ratio: number | null;
  simulated_pnl: number | null;
  avg_time_to_first_sell_sec: number | null;
  quick_dump_rate: number | null;
}

/**
 * Rank wallets using cached stats from the wallets table + follow simulation scores.
 * This is fast because it only reads pre-computed values - no recalculation.
 *
 * Wallets are now ranked by a composite score that considers:
 * - Simulated follow returns (what a copier would actually make)
 * - Followability ratio (simulated PnL / actual PnL)
 * - Quick dump rate (lower is better)
 */
export function rankProfitableWallets({
  timeframe = '30d',
  minTrades = 20,
  minVolume = 5,
  minWinRate = 55,
  minFollowability = 0,  // Default to no filter
  limit = 20,
}: RankingOptions = {}): WalletRanking[] {
  // Pull known wallets with cached stats
  const walletRows = walletQueries.getAllWallets.all('default') as WalletRow[];

  // Pull all follow scores into a map for fast lookup
  const followScoreRows = followScoreQueries.getAllScores.all() as FollowScoreRow[];
  const followScoreMap = new Map<string, FollowScoreRow>();
  for (const score of followScoreRows) {
    followScoreMap.set(score.wallet_address, score);
  }

  const results: WalletRanking[] = [];

  for (const row of walletRows) {
    // Use cached stats - skip wallets that haven't been synced yet
    const totalTrades = row.total_trades ?? 0;
    const totalSolVolume = row.total_sol_volume ?? 0;
    const winRate = row.win_rate ?? 0;
    const realizedPnL = row.total_realized_pnl ?? 0;

    // Apply basic filters using cached data
    if (totalTrades < minTrades) continue;
    if (totalSolVolume < minVolume) continue;
    if (winRate < minWinRate) continue;

    // Get follow score data
    const followScore = followScoreMap.get(row.address);
    const followabilityRatio = followScore?.followability_ratio ?? undefined;
    const simulatedPnL = followScore?.simulated_pnl ?? undefined;
    const avgTimeToFirstSellSec = followScore?.avg_time_to_first_sell_sec ?? undefined;
    const quickDumpRate = followScore?.quick_dump_rate ?? undefined;

    // Apply followability filter if set
    if (minFollowability > 0) {
      if (followabilityRatio === undefined || followabilityRatio < minFollowability) {
        continue;
      }
    }

    results.push({
      address: row.address,
      name: row.name,
      emoji: row.emoji,
      realizedPnL,
      winRate,
      totalTrades,
      totalSolVolume,
      timeframe,
      quickFlipRate: row.quick_flip_rate ?? undefined,
      exitedTokenRate: row.exited_token_rate ?? undefined,
      followabilityRatio,
      simulatedPnL,
      avgTimeToFirstSellSec,
      quickDumpRate,
    });
  }

  // Sort by composite score:
  // Primary: simulated PnL (what follower would actually make)
  // Secondary: followability ratio (how much of their profits you'd capture)
  // Fallback: actual PnL (if no follow scores yet)
  results.sort((a, b) => {
    // If both have simulated PnL, sort by that
    if (a.simulatedPnL !== undefined && b.simulatedPnL !== undefined) {
      return b.simulatedPnL - a.simulatedPnL;
    }
    // If only one has simulated PnL, prefer the one that has it
    if (a.simulatedPnL !== undefined) return -1;
    if (b.simulatedPnL !== undefined) return 1;
    // Fallback to actual PnL
    return b.realizedPnL - a.realizedPnL;
  });

  return results.slice(0, limit);
}
