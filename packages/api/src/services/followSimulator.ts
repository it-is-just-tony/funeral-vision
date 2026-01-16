import type { Trade } from '@funeral-vision/shared';
import { tradeQueries, followScoreQueries, walletQueries } from '../db/index.js';

// Slippage models - percentage applied to each trade
export type SlippageModel = 'conservative' | 'moderate' | 'aggressive';

const SLIPPAGE_CONFIG: Record<SlippageModel, { small: number; medium: number; large: number }> = {
  conservative: { small: 0.01, medium: 0.02, large: 0.05 },  // 1%, 2%, 5%
  moderate: { small: 0.02, medium: 0.05, large: 0.10 },      // 2%, 5%, 10%
  aggressive: { small: 0.03, medium: 0.08, large: 0.15 },    // 3%, 8%, 15%
};

// Trade size thresholds in SOL
const SIZE_THRESHOLDS = {
  small: 0.5,   // < 0.5 SOL
  medium: 2.0,  // 0.5 - 2 SOL
  // large: > 2 SOL
};

// Time thresholds for followability
const TIME_THRESHOLDS = {
  unfollowable: 30,      // < 30s = impossible to follow
  veryRisky: 60,         // 30s - 1min = very risky
  risky: 120,            // 1-2 min = risky
  moderate: 300,         // 2-5 min = moderate
  // > 5 min = followable
};

interface TokenRoundTrip {
  tokenMint: string;
  buys: Trade[];
  sells: Trade[];
  timeToFirstSellSec: number | null;
  actualPnL: number;
  simulatedPnL: number;
  totalBuySol: number;
  isFollowable: boolean;
}

export interface FollowSimulationResult {
  walletAddress: string;
  delaySeconds: number;
  slippageModel: SlippageModel;

  // Core metrics
  actualPnL: number;
  simulatedPnL: number;
  followabilityRatio: number;

  // Timing analysis
  avgTimeToFirstSellSec: number | null;
  medianTimeToFirstSellSec: number | null;
  quickDumpRate: number;  // % of tokens with first sell < 60s

  // Volume breakdown
  totalTokensTraded: number;
  followableTokens: number;
  unfollowableTokens: number;

  // Position sizing
  avgEntrySizeSol: number;

  // Per-token breakdown (for detailed analysis)
  tokenBreakdown: TokenRoundTrip[];
}

/**
 * Get slippage percentage based on trade size and model
 */
function getSlippage(solAmount: number, model: SlippageModel): number {
  const config = SLIPPAGE_CONFIG[model];
  if (solAmount < SIZE_THRESHOLDS.small) return config.small;
  if (solAmount < SIZE_THRESHOLDS.medium) return config.medium;
  return config.large;
}

/**
 * Calculate followability score based on time to first sell
 */
function getFollowabilityScore(timeToFirstSellSec: number): number {
  if (timeToFirstSellSec < TIME_THRESHOLDS.unfollowable) return 0.0;
  if (timeToFirstSellSec < TIME_THRESHOLDS.veryRisky) return 0.2;
  if (timeToFirstSellSec < TIME_THRESHOLDS.risky) return 0.5;
  if (timeToFirstSellSec < TIME_THRESHOLDS.moderate) return 0.8;
  return 1.0;
}

/**
 * Simulate following a wallet's trades
 */
export function simulateFollowReturns(
  walletAddress: string,
  delaySeconds: number = 5,
  slippageModel: SlippageModel = 'moderate'
): FollowSimulationResult {
  // Get all trades for wallet
  const rows = tradeQueries.getTradesByWallet.all(walletAddress) as any[];
  const trades: Trade[] = rows.map(row => ({
    id: row.id,
    walletAddress: row.wallet_address,
    signature: row.signature,
    timestamp: row.timestamp,
    type: row.type,
    tokenMint: row.token_mint,
    tokenSymbol: row.token_symbol,
    tokenAmount: row.token_amount,
    solAmount: row.sol_amount,
    pricePerToken: row.price_per_token,
    dex: row.dex,
  }));

  // Group trades by token
  const tradesByToken = new Map<string, Trade[]>();
  for (const trade of trades) {
    const existing = tradesByToken.get(trade.tokenMint) || [];
    existing.push(trade);
    tradesByToken.set(trade.tokenMint, existing);
  }

  const tokenBreakdown: TokenRoundTrip[] = [];
  let totalActualPnL = 0;
  let totalSimulatedPnL = 0;
  let totalBuySol = 0;
  const timeToFirstSells: number[] = [];
  let quickDumpCount = 0;
  let followableCount = 0;
  let unfollowableCount = 0;

  for (const [tokenMint, tokenTrades] of tradesByToken) {
    // Sort by timestamp
    const sorted = [...tokenTrades].sort((a, b) => a.timestamp - b.timestamp);

    const buys = sorted.filter(t => t.type === 'buy');
    const sells = sorted.filter(t => t.type === 'sell');

    // Skip tokens with no buys or no sells (incomplete round trips)
    if (buys.length === 0 || sells.length === 0) continue;

    const firstBuy = buys[0];
    const firstSell = sells[0];
    const timeToFirstSellSec = firstSell.timestamp - firstBuy.timestamp;

    // Calculate actual PnL for this token
    const totalBought = buys.reduce((sum, t) => sum + t.solAmount, 0);
    const totalSold = sells.reduce((sum, t) => sum + t.solAmount, 0);
    const actualPnL = totalSold - totalBought;

    // Simulate follower's PnL
    let simulatedPnL = 0;
    const followabilityScore = getFollowabilityScore(timeToFirstSellSec);

    if (followabilityScore > 0) {
      // Simulate each buy with slippage (follower pays more)
      let simulatedCost = 0;
      for (const buy of buys) {
        const slippage = getSlippage(buy.solAmount, slippageModel);
        // Follower enters after delay, price likely moved up + slippage
        const priceImpact = slippage + (delaySeconds * 0.001); // ~0.1% per second price drift
        simulatedCost += buy.solAmount * (1 + priceImpact);
      }

      // Simulate each sell with slippage (follower gets less)
      let simulatedProceeds = 0;
      for (const sell of sells) {
        const slippage = getSlippage(sell.solAmount, slippageModel);
        // Follower exits after delay, price likely moved down + slippage
        const priceImpact = slippage + (delaySeconds * 0.001);
        simulatedProceeds += sell.solAmount * (1 - priceImpact);
      }

      simulatedPnL = (simulatedProceeds - simulatedCost) * followabilityScore;
    }

    // Track metrics
    totalActualPnL += actualPnL;
    totalSimulatedPnL += simulatedPnL;
    totalBuySol += totalBought;
    timeToFirstSells.push(timeToFirstSellSec);

    if (timeToFirstSellSec < 60) {
      quickDumpCount++;
    }

    const isFollowable = followabilityScore >= 0.5;
    if (isFollowable) {
      followableCount++;
    } else {
      unfollowableCount++;
    }

    tokenBreakdown.push({
      tokenMint,
      buys,
      sells,
      timeToFirstSellSec,
      actualPnL,
      simulatedPnL,
      totalBuySol: totalBought,
      isFollowable,
    });
  }

  // Calculate aggregate metrics
  const totalTokensTraded = tokenBreakdown.length;
  const quickDumpRate = totalTokensTraded > 0 ? quickDumpCount / totalTokensTraded : 0;
  const avgEntrySizeSol = totalTokensTraded > 0 ? totalBuySol / totalTokensTraded : 0;

  // Calculate time to first sell stats
  let avgTimeToFirstSellSec: number | null = null;
  let medianTimeToFirstSellSec: number | null = null;

  if (timeToFirstSells.length > 0) {
    avgTimeToFirstSellSec = timeToFirstSells.reduce((a, b) => a + b, 0) / timeToFirstSells.length;
    const sorted = [...timeToFirstSells].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianTimeToFirstSellSec = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  // Calculate followability ratio
  // Avoid division by zero, and handle cases where actual PnL is negative
  let followabilityRatio = 0;
  if (totalActualPnL > 0 && totalSimulatedPnL > 0) {
    followabilityRatio = totalSimulatedPnL / totalActualPnL;
  } else if (totalActualPnL > 0 && totalSimulatedPnL <= 0) {
    // They're profitable but follower would lose money
    followabilityRatio = totalSimulatedPnL / totalActualPnL; // Will be negative or zero
  } else if (totalActualPnL <= 0) {
    // They're not profitable, ratio doesn't matter
    followabilityRatio = 0;
  }

  return {
    walletAddress,
    delaySeconds,
    slippageModel,
    actualPnL: totalActualPnL,
    simulatedPnL: totalSimulatedPnL,
    followabilityRatio,
    avgTimeToFirstSellSec,
    medianTimeToFirstSellSec,
    quickDumpRate,
    totalTokensTraded,
    followableTokens: followableCount,
    unfollowableTokens: unfollowableCount,
    avgEntrySizeSol,
    tokenBreakdown,
  };
}

/**
 * Run simulation and save to database
 */
export function scoreWallet(
  walletAddress: string,
  delaySeconds: number = 5,
  slippageModel: SlippageModel = 'moderate'
): FollowSimulationResult {
  const result = simulateFollowReturns(walletAddress, delaySeconds, slippageModel);

  // Save to database
  followScoreQueries.upsertScore.run({
    wallet_address: walletAddress,
    delay_seconds: delaySeconds,
    slippage_model: slippageModel,
    actual_pnl: result.actualPnL,
    simulated_pnl: result.simulatedPnL,
    followability_ratio: result.followabilityRatio,
    avg_time_to_first_sell_sec: result.avgTimeToFirstSellSec,
    median_time_to_first_sell_sec: result.medianTimeToFirstSellSec,
    quick_dump_rate: result.quickDumpRate,
    total_tokens_traded: result.totalTokensTraded,
    followable_tokens: result.followableTokens,
    unfollowable_tokens: result.unfollowableTokens,
    avg_entry_size_sol: result.avgEntrySizeSol,
    scored_at: Math.floor(Date.now() / 1000),
  });

  return result;
}

/**
 * Score all wallets in the catalog
 */
export function scoreAllWallets(
  delaySeconds: number = 5,
  slippageModel: SlippageModel = 'moderate'
): { scored: number; results: FollowSimulationResult[] } {
  // Get all wallet addresses from wallets table
  const wallets = walletQueries.getAllWallets.all('default') as { address: string }[];

  const results: FollowSimulationResult[] = [];
  for (const wallet of wallets) {
    try {
      const result = scoreWallet(wallet.address, delaySeconds, slippageModel);
      results.push(result);
    } catch (err) {
      console.error(`Failed to score wallet ${wallet.address}:`, err);
    }
  }

  return { scored: results.length, results };
}

/**
 * Get cached follow score for a wallet
 */
export function getFollowScore(walletAddress: string): FollowSimulationResult | null {
  const row = followScoreQueries.getScore.get(walletAddress) as any;
  if (!row) return null;

  return {
    walletAddress: row.wallet_address,
    delaySeconds: row.delay_seconds,
    slippageModel: row.slippage_model,
    actualPnL: row.actual_pnl,
    simulatedPnL: row.simulated_pnl,
    followabilityRatio: row.followability_ratio,
    avgTimeToFirstSellSec: row.avg_time_to_first_sell_sec,
    medianTimeToFirstSellSec: row.median_time_to_first_sell_sec,
    quickDumpRate: row.quick_dump_rate,
    totalTokensTraded: row.total_tokens_traded,
    followableTokens: row.followable_tokens,
    unfollowableTokens: row.unfollowable_tokens,
    avgEntrySizeSol: row.avg_entry_size_sol,
    tokenBreakdown: [], // Not stored in DB, only available from fresh simulation
  };
}
