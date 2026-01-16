import {
  type Trade,
  type Position,
  type PnLSummary,
  type Timeframe,
  TIMEFRAME_SECONDS,
} from '@solana-pnl/shared';
import { tradeQueries, positionQueries, lotQueries, db } from '../db/index.js';

interface CostBasisLot {
  id: number;
  wallet_address: string;
  token_mint: string;
  trade_id: string;
  timestamp: number;
  amount: number;
  remaining_amount: number;
  price_per_token: number;
}

/**
 * Calculate realized PnL using FIFO cost basis
 */
export function calculateFIFOPnL(
  walletAddress: string,
  trades: Trade[]
): { positions: Position[]; totalRealizedPnL: number } {
  // Group trades by token
  const tradesByToken: Map<string, Trade[]> = new Map();

  for (const trade of trades) {
    const existing = tradesByToken.get(trade.tokenMint) || [];
    existing.push(trade);
    tradesByToken.set(trade.tokenMint, existing);
  }

  const positions: Position[] = [];
  let totalRealizedPnL = 0;

  // Clear existing cost basis lots for this wallet
  lotQueries.deleteLotsByWallet.run(walletAddress);
  positionQueries.deletePositionsByWallet.run(walletAddress);

  for (const [tokenMint, tokenTrades] of tradesByToken) {
    // Sort by timestamp ascending for FIFO
    const sortedTrades = [...tokenTrades].sort((a, b) => a.timestamp - b.timestamp);

    let totalBought = 0;
    let totalSold = 0;
    let totalCostBasis = 0;
    let totalProceeds = 0;
    let realizedPnL = 0;
    let winCount = 0;
    let tradeCount = sortedTrades.length;
    let tokenSymbol = sortedTrades[0]?.tokenSymbol;

    // Track buy lots for FIFO
    const buyLots: { tradeId: string; amount: number; remaining: number; price: number; timestamp: number }[] = [];

    for (const trade of sortedTrades) {
      if (trade.type === 'buy') {
        // Add to buy lots
        buyLots.push({
          tradeId: trade.id,
          amount: trade.tokenAmount,
          remaining: trade.tokenAmount,
          price: trade.pricePerToken,
          timestamp: trade.timestamp,
        });
        totalBought += trade.tokenAmount;
        totalCostBasis += trade.solAmount;
      } else {
        // Sell - match against oldest buy lots (FIFO)
        let sellRemaining = trade.tokenAmount;
        let sellCostBasis = 0;

        for (const lot of buyLots) {
          if (sellRemaining <= 0) break;
          if (lot.remaining <= 0) continue;

          const matchAmount = Math.min(lot.remaining, sellRemaining);
          sellCostBasis += matchAmount * lot.price;
          lot.remaining -= matchAmount;
          sellRemaining -= matchAmount;
        }

        const sellProfit = trade.solAmount - sellCostBasis;
        realizedPnL += sellProfit;
        totalSold += trade.tokenAmount;
        totalProceeds += trade.solAmount;

        if (sellProfit > 0) {
          winCount++;
        }
      }
    }

    // Save remaining buy lots to database
    for (const lot of buyLots) {
      if (lot.remaining > 0) {
        lotQueries.insertLot.run({
          wallet_address: walletAddress,
          token_mint: tokenMint,
          trade_id: lot.tradeId,
          timestamp: lot.timestamp,
          amount: lot.amount,
          remaining_amount: lot.remaining,
          price_per_token: lot.price,
        });
      }
    }

    const remainingTokens = totalBought - totalSold;
    const averageBuyPrice = totalBought > 0 ? totalCostBasis / totalBought : 0;

    const position: Position = {
      walletAddress,
      tokenMint,
      tokenSymbol,
      totalBought,
      totalSold,
      totalCostBasis,
      totalProceeds,
      remainingTokens,
      averageBuyPrice,
      realizedPnL,
      tradeCount,
      winCount,
      firstTradeAt: sortedTrades[0]?.timestamp || 0,
      lastTradeAt: sortedTrades[sortedTrades.length - 1]?.timestamp || 0,
    };

    positions.push(position);
    totalRealizedPnL += realizedPnL;

    // Save position to database
    positionQueries.upsertPosition.run({
      wallet_address: walletAddress,
      token_mint: tokenMint,
      token_symbol: tokenSymbol || null,
      total_bought: totalBought,
      total_sold: totalSold,
      total_cost_basis: totalCostBasis,
      total_proceeds: totalProceeds,
      remaining_tokens: remainingTokens,
      average_buy_price: averageBuyPrice,
      realized_pnl: realizedPnL,
      trade_count: tradeCount,
      win_count: winCount,
      first_trade_at: position.firstTradeAt,
      last_trade_at: position.lastTradeAt,
    });
  }

  return { positions, totalRealizedPnL };
}

/**
 * Generate PnL summary for a wallet with timeframe filtering
 * 
 * IMPORTANT: We always calculate FIFO with ALL trades to ensure accurate cost basis.
 * For example, if you bought a token 4 days ago and sell it today, the 24h view 
 * should still show the correct PnL based on the original cost basis.
 * 
 * The timeframe filter only affects which trades are REPORTED, not the cost basis calculation.
 */
export function generatePnLSummary(
  walletAddress: string,
  allTrades: Trade[],  // All trades for accurate FIFO
  timeframe: Timeframe = 'all'
): PnLSummary {
  const now = Math.floor(Date.now() / 1000);
  const timeframeSeconds = TIMEFRAME_SECONDS[timeframe];
  const periodStart = timeframeSeconds ? now - timeframeSeconds : 0;
  const periodEnd = now;

  // First, calculate FIFO PnL with ALL trades to get accurate cost basis
  // This builds the cost basis lots correctly
  const { positions: allPositions } = calculateFIFOPnL(walletAddress, allTrades);

  // Now filter trades by timeframe for reporting
  const tradesInPeriod = timeframeSeconds
    ? allTrades.filter((t) => t.timestamp >= periodStart)
    : allTrades;

  // Calculate realized PnL only for sells within the timeframe
  // We need to re-calculate PnL for just this period using pre-existing cost basis
  let totalRealizedPnL = 0;
  let winCount = 0;
  let lossCount = 0;

  // Group trades by token for period-specific calculations
  const periodTradesByToken: Map<string, Trade[]> = new Map();
  for (const trade of tradesInPeriod) {
    const existing = periodTradesByToken.get(trade.tokenMint) || [];
    existing.push(trade);
    periodTradesByToken.set(trade.tokenMint, existing);
  }

  // Build positions that had activity in this period
  const periodPositions: Position[] = [];

  for (const [tokenMint, periodTrades] of periodTradesByToken) {
    // Get the full position (with all-time cost basis)
    const fullPosition = allPositions.find(p => p.tokenMint === tokenMint);
    
    // Calculate period-specific metrics
    const periodBuys = periodTrades.filter(t => t.type === 'buy');
    const periodSells = periodTrades.filter(t => t.type === 'sell');
    
    const periodBought = periodBuys.reduce((sum, t) => sum + t.tokenAmount, 0);
    const periodSold = periodSells.reduce((sum, t) => sum + t.tokenAmount, 0);
    const periodCostBasis = periodBuys.reduce((sum, t) => sum + t.solAmount, 0);
    const periodProceeds = periodSells.reduce((sum, t) => sum + t.solAmount, 0);
    
    // For sells in this period, calculate PnL using the full position's average buy price
    // This ensures we use the correct cost basis even for tokens bought before the period
    let periodRealizedPnL = 0;
    let periodWinCount = 0;
    
    if (fullPosition && periodSells.length > 0) {
      for (const sell of periodSells) {
        // Use the average buy price from all-time position
        const costBasisForSell = sell.tokenAmount * fullPosition.averageBuyPrice;
        const profit = sell.solAmount - costBasisForSell;
        periodRealizedPnL += profit;
        if (profit > 0) periodWinCount++;
      }
    }

    totalRealizedPnL += periodRealizedPnL;
    if (periodRealizedPnL > 0) winCount += periodWinCount;
    else if (periodRealizedPnL < 0) lossCount += periodSells.length - periodWinCount;

    // Create period-specific position
    periodPositions.push({
      walletAddress,
      tokenMint,
      tokenSymbol: fullPosition?.tokenSymbol,
      totalBought: periodBought,
      totalSold: periodSold,
      totalCostBasis: periodCostBasis,
      totalProceeds: periodProceeds,
      remainingTokens: fullPosition?.remainingTokens || 0,
      averageBuyPrice: fullPosition?.averageBuyPrice || 0,  // Use all-time avg price
      realizedPnL: periodRealizedPnL,
      tradeCount: periodTrades.length,
      winCount: periodWinCount,
      firstTradeAt: Math.min(...periodTrades.map(t => t.timestamp)),
      lastTradeAt: Math.max(...periodTrades.map(t => t.timestamp)),
    });
  }

  // Aggregate metrics for the period
  const totalBuys = tradesInPeriod.filter((t) => t.type === 'buy').length;
  const totalSells = tradesInPeriod.filter((t) => t.type === 'sell').length;
  const totalTrades = tradesInPeriod.length;

  const winRate = totalSells > 0 ? (winCount / totalSells) * 100 : 0;

  // Volume metrics
  const totalSolVolume = tradesInPeriod.reduce((sum, t) => sum + t.solAmount, 0);
  const avgTradeSize = totalTrades > 0 ? totalSolVolume / totalTrades : 0;

  // Calculate average hold duration
  let totalHoldDuration = 0;
  let holdCount = 0;
  for (const pos of periodPositions) {
    if (pos.totalSold > 0 && pos.firstTradeAt && pos.lastTradeAt) {
      totalHoldDuration += pos.lastTradeAt - pos.firstTradeAt;
      holdCount++;
    }
  }
  const avgHoldDuration = holdCount > 0 ? totalHoldDuration / holdCount : 0;

  // Unique tokens
  const uniqueTokensTraded = new Set(tradesInPeriod.map((t) => t.tokenMint)).size;

  // Find best and worst trades (by realized PnL per trade)
  const sellTrades = tradesInPeriod.filter((t) => t.type === 'sell');
  let bestTrade: Trade | undefined;
  let worstTrade: Trade | undefined;
  let bestPnL = -Infinity;
  let worstPnL = Infinity;

  // Calculate trade PnL using all-time average buy price
  for (const sell of sellTrades) {
    const pos = allPositions.find((p) => p.tokenMint === sell.tokenMint);
    if (pos && pos.averageBuyPrice > 0) {
      const tradePnL = sell.solAmount - (sell.tokenAmount * pos.averageBuyPrice);
      if (tradePnL > bestPnL) {
        bestPnL = tradePnL;
        bestTrade = sell;
      }
      if (tradePnL < worstPnL) {
        worstPnL = tradePnL;
        worstTrade = sell;
      }
    }
  }

  return {
    walletAddress,
    timeframe,
    periodStart,
    periodEnd,
    totalRealizedPnL,
    totalTrades,
    totalBuys,
    totalSells,
    winCount,
    lossCount,
    winRate,
    totalSolVolume,
    avgTradeSize,
    avgHoldDuration,
    uniqueTokensTraded,
    bestTrade,
    worstTrade,
    positions: periodPositions,
  };
}

/**
 * Get trades from database with timeframe filter
 */
export function getTradesForWallet(
  walletAddress: string,
  timeframe: Timeframe = 'all'
): Trade[] {
  const now = Math.floor(Date.now() / 1000);
  const timeframeSeconds = TIMEFRAME_SECONDS[timeframe];
  const periodStart = timeframeSeconds ? now - timeframeSeconds : 0;

  let rows: any[];
  if (timeframeSeconds) {
    rows = tradeQueries.getTradesByWalletAndTimeframe.all(walletAddress, periodStart);
  } else {
    rows = tradeQueries.getTradesByWallet.all(walletAddress);
  }

  return rows.map((row) => ({
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
}

/**
 * Get positions from database
 */
export function getPositionsForWallet(walletAddress: string): Position[] {
  const rows = positionQueries.getPositionsByWallet.all(walletAddress) as any[];

  return rows.map((row) => ({
    walletAddress: row.wallet_address,
    tokenMint: row.token_mint,
    tokenSymbol: row.token_symbol,
    totalBought: row.total_bought,
    totalSold: row.total_sold,
    totalCostBasis: row.total_cost_basis,
    totalProceeds: row.total_proceeds,
    remainingTokens: row.remaining_tokens,
    averageBuyPrice: row.average_buy_price,
    realizedPnL: row.realized_pnl,
    tradeCount: row.trade_count,
    winCount: row.win_count,
    firstTradeAt: row.first_trade_at,
    lastTradeAt: row.last_trade_at,
  }));
}
