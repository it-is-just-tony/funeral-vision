import { Router, type Request, type Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import type { Timeframe, Trade, CatalogWallet, WalletImportPayload, AggregatedStats, WalletPnLBreakdown } from '@solana-pnl/shared';
import { getHeliusService } from '../services/helius.js';
import { parseEnhancedTransactions } from '../services/parser.js';
import {
  generatePnLSummary,
  getTradesForWallet,
  getPositionsForWallet,
} from '../services/pnl.js';
import { walletQueries, txQueries, tradeQueries, tokenQueries, db } from '../db/index.js';
import { statusEmitter, type StatusEvent } from '../services/statusEmitter.js';
import { buildWalletProfile } from '../services/profile.js';
import { rankProfitableWallets } from '../services/discovery.js';

export const walletRouter = Router();

// Default user ID (for now, single user mode)
const DEFAULT_USER_ID = 'default';

// Cache for in-progress syncs
const syncInProgress = new Map<string, Promise<void>>();

/**
 * SSE endpoint for real-time status updates
 * GET /api/wallet/status/events
 */
walletRouter.get('/status/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ id: `connected-${Date.now()}`, type: 'connected', message: 'Connected', timestamp: Date.now() })}\n\n`);

  // Handler for status events
  const statusHandler = (event: StatusEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  statusEmitter.on('status', statusHandler);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  // Cleanup on close
  req.on('close', () => {
    statusEmitter.off('status', statusHandler);
    clearInterval(heartbeat);
    res.end();
  });
});

/**
 * Validate Solana address
 */
function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sync wallet transactions from Helius
 */
async function syncWalletTransactions(
  walletAddress: string,
  userId: string = DEFAULT_USER_ID,
  forceRefresh = false,
  walletInfo?: { name: string; emoji: string }
): Promise<{ newTransactions: number; totalTrades: number; pnlSummary?: any }> {
  const helius = getHeliusService();
  
  // Build wallet display info
  const wallet = walletInfo || {
    name: walletAddress.slice(0, 8),
    emoji: '👛'
  };
  const walletDisplay = { address: walletAddress, name: wallet.name, emoji: wallet.emoji };

  // Get last synced signature for incremental sync
  let lastSignature: string | undefined;
  if (!forceRefresh) {
    const existingWallet = walletQueries.getWallet.get(walletAddress, userId) as any;
    lastSignature = existingWallet?.last_signature;
    // Use existing wallet info if not provided
    if (!walletInfo && existingWallet) {
      walletDisplay.name = existingWallet.name || walletDisplay.name;
      walletDisplay.emoji = existingWallet.emoji || walletDisplay.emoji;
    }
  }

  statusEmitter.info(
    lastSignature ? `Starting incremental sync` : `Starting full sync`,
    walletDisplay
  );

  console.log(
    `Syncing wallet ${walletAddress}${lastSignature ? ` from ${lastSignature}` : ' (full sync)'}`
  );

  // Fetch new signatures
  const signatures = await helius.getAllSignaturesForAddress(walletAddress, {
    until: lastSignature,
    maxSignatures: 5000,
    onProgress: (count) => {
      statusEmitter.progress(`Fetching signatures`, count, count + 100, walletDisplay);
      console.log(`Fetched ${count} signatures...`);
    },
  });

  if (signatures.length === 0) {
    statusEmitter.success(`No new transactions found`, walletDisplay);
    console.log('No new transactions found');
    return { newTransactions: 0, totalTrades: 0 };
  }

  statusEmitter.info(`Found ${signatures.length} transactions to parse`, walletDisplay);
  console.log(`Found ${signatures.length} new transactions, parsing...`);

  // Parse transactions in batches
  const signatureStrings = signatures.map((s) => s.signature);
  const parsedTransactions = await helius.parseAllTransactions(signatureStrings, {
    onProgress: (parsed, total) => {
      statusEmitter.progress(`Parsing transactions`, parsed, total, walletDisplay);
      console.log(`Parsed ${parsed}/${total} transactions...`);
    },
  });

  // Extract trades
  const allTrades = parseEnhancedTransactions(parsedTransactions, walletAddress);
  statusEmitter.info(`Extracted ${allTrades.length} trades`, walletDisplay);
  console.log(`Extracted ${allTrades.length} trades`);

  // Save to database in a transaction
  const insertTx = db.transaction(() => {
    // First, ensure wallet record exists (required for foreign keys)
    const existingWallet = walletQueries.getWallet.get(walletAddress, userId) as any;
    // Get the earliest timestamp from new transactions for first_synced_at
    const earliestNewTimestamp = signatures.reduce((min, s) => {
      const ts = s.blockTime || 0;
      return ts > 0 && (min === 0 || ts < min) ? ts : min;
    }, 0);

    walletQueries.upsertWallet.run({
      address: walletAddress,
      user_id: userId,
      name: existingWallet?.name ?? null,
      emoji: existingWallet?.emoji ?? null,
      alerts_on: existingWallet?.alerts_on ?? 0,
      last_synced_at: Math.floor(Date.now() / 1000),
      first_synced_at: earliestNewTimestamp || null,
      last_signature: signatures[0]?.signature ?? lastSignature ?? null,
      total_transactions: (existingWallet?.total_transactions ?? 0) + signatures.length,
      total_realized_pnl: null,
      win_rate: null,
      total_sol_volume: null,
      total_trades: null,
      quick_flip_rate: null,
      exited_token_rate: null,
      created_at: existingWallet?.created_at ?? Math.floor(Date.now() / 1000),
    });

    // Save raw transactions
    for (let i = 0; i < signatures.length; i++) {
      const sig = signatures[i];
      const parsed = parsedTransactions.find((p) => p.signature === sig.signature);
      txQueries.insertTransaction.run({
        signature: sig.signature,
        wallet_address: walletAddress,
        timestamp: sig.blockTime || 0,
        block_slot: sig.slot,
        raw_data: JSON.stringify(parsed || {}),
        parsed: parsed ? 1 : 0,
      });
    }

    // Save trades
    for (const trade of allTrades) {
      tradeQueries.insertTrade.run({
        id: trade.id,
        wallet_address: trade.walletAddress,
        signature: trade.signature,
        timestamp: trade.timestamp,
        type: trade.type,
        token_mint: trade.tokenMint,
        token_symbol: trade.tokenSymbol || null,
        token_amount: trade.tokenAmount,
        sol_amount: trade.solAmount,
        price_per_token: trade.pricePerToken,
        dex: trade.dex || null,
      });
    }
  });

  insertTx();
  statusEmitter.info(`Saved ${allTrades.length} trades to database`, walletDisplay);

  // Calculate and update PnL stats
  const allTradesForWallet = getTradesForWallet(walletAddress, 'all');
  const pnlSummary = generatePnLSummary(walletAddress, allTradesForWallet, 'all');

  // Calculate behavior profile stats
  const profile = buildWalletProfile(walletAddress);

  // Get earliest trade timestamp for first_synced_at
  const earliestTradeTimestamp = allTradesForWallet.length > 0
    ? Math.min(...allTradesForWallet.map(t => t.timestamp))
    : null;

  walletQueries.updateWalletStats.run({
    address: walletAddress,
    user_id: userId,
    last_synced_at: Math.floor(Date.now() / 1000),
    first_synced_at: earliestTradeTimestamp,
    last_signature: signatures[0]?.signature ?? lastSignature ?? null,
    total_transactions: (walletQueries.getWallet.get(walletAddress, userId) as any)?.total_transactions ?? signatures.length,
    total_realized_pnl: pnlSummary.totalRealizedPnL ?? null,
    win_rate: pnlSummary.winRate ?? null,
    total_sol_volume: pnlSummary.totalSolVolume ?? null,
    total_trades: pnlSummary.totalTrades ?? null,
    quick_flip_rate: profile.earlyExitRate ?? null,
    exited_token_rate: profile.roundTripRate ?? null,
  });

  const pnlEmoji = pnlSummary.totalRealizedPnL >= 0 ? '📈' : '📉';
  statusEmitter.success(
    `Complete! ${pnlEmoji} ${pnlSummary.totalRealizedPnL.toFixed(2)} SOL realized PnL`,
    walletDisplay,
    { totalTrades: allTrades.length, pnl: pnlSummary.totalRealizedPnL }
  );

  return { newTransactions: signatures.length, totalTrades: allTrades.length, pnlSummary };
}

/**
 * GET /api/wallet/:address/analyze
 * Sync wallet and return PnL analysis
 */
walletRouter.get('/:address/analyze', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const timeframe = (req.query.timeframe as Timeframe) || 'all';
    const forceRefresh = req.query.refresh === 'true';

    if (!isValidSolanaAddress(address)) {
      res.status(400).json({ success: false, error: 'Invalid Solana address' });
      return;
    }

    // Check if sync is already in progress
    let syncPromise = syncInProgress.get(address);
    if (!syncPromise || forceRefresh) {
      syncPromise = syncWalletTransactions(address, DEFAULT_USER_ID, forceRefresh)
        .then((result) => {
          console.log(`Sync complete: ${result.newTransactions} new txs, ${result.totalTrades} trades`);
        })
        .finally(() => {
          syncInProgress.delete(address);
        });
      syncInProgress.set(address, syncPromise);
    }

    await syncPromise;

    // Get ALL trades for accurate FIFO cost basis calculation
    // The timeframe filter is applied inside generatePnLSummary for reporting
    const allTrades = getTradesForWallet(address, 'all');
    const summary = generatePnLSummary(address, allTrades, timeframe);

    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Error analyzing wallet:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/wallet/:address/trades
 * Get trades for a wallet
 */
walletRouter.get('/:address/trades', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const timeframe = (req.query.timeframe as Timeframe) || 'all';
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 100);

    if (!isValidSolanaAddress(address)) {
      res.status(400).json({ success: false, error: 'Invalid Solana address' });
      return;
    }

    const allTrades = getTradesForWallet(address, timeframe);
    const total = allTrades.length;
    const trades = allTrades.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      success: true,
      data: {
        trades,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/wallet/:address/positions
 * Get current positions for a wallet
 */
walletRouter.get('/:address/positions', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    if (!isValidSolanaAddress(address)) {
      res.status(400).json({ success: false, error: 'Invalid Solana address' });
      return;
    }

    const positions = getPositionsForWallet(address);

    res.json({
      success: true,
      data: { positions },
    });
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/wallet/:address/profile
 * Behavior profile using cached data (no extra Helius calls)
 */
walletRouter.get('/:address/profile', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    if (!isValidSolanaAddress(address)) {
      res.status(400).json({ success: false, error: 'Invalid Solana address' });
      return;
    }

    const profile = buildWalletProfile(address);

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error('Error building profile:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/wallet/discovery/profitable
 * Return ranked wallets using cached data only
 */
walletRouter.get('/discovery/profitable', async (req: Request, res: Response) => {
  try {
    const timeframe = (req.query.timeframe as Timeframe) || '30d';
    const minTrades = req.query.minTrades ? parseInt(req.query.minTrades as string, 10) : undefined;
    const minVolume = req.query.minVolume ? parseFloat(req.query.minVolume as string) : undefined;
    const minWinRate = req.query.minWinRate ? parseFloat(req.query.minWinRate as string) : undefined;
    const minFollowability = req.query.minFollowability ? parseFloat(req.query.minFollowability as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    const rankings = rankProfitableWallets({
      timeframe,
      minTrades,
      minVolume,
      minWinRate,
      minFollowability,
      limit,
    });

    res.json({ success: true, data: rankings });
  } catch (error) {
    console.error('Error ranking wallets:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============ FOLLOW SIMULATION ENDPOINTS ============

/**
 * POST /api/wallet/follow-score/calculate-all
 * Calculate follow scores for all wallets
 */
walletRouter.post('/follow-score/calculate-all', async (req: Request, res: Response) => {
  try {
    const { delaySeconds = 5, slippageModel = 'moderate' } = req.body as {
      delaySeconds?: number;
      slippageModel?: 'conservative' | 'moderate' | 'aggressive';
    };

    const { scoreAllWallets } = await import('../services/followSimulator.js');
    const result = scoreAllWallets(delaySeconds, slippageModel);

    res.json({
      success: true,
      data: {
        scored: result.scored,
        summary: result.results.map(r => ({
          address: r.walletAddress,
          followabilityRatio: r.followabilityRatio,
          actualPnL: r.actualPnL,
          simulatedPnL: r.simulatedPnL,
          quickDumpRate: r.quickDumpRate,
        })),
      },
    });
  } catch (error) {
    console.error('Error calculating follow scores:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/wallet/:address/follow-score
 * Calculate follow score for a single wallet
 */
walletRouter.post('/:address/follow-score', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { delaySeconds = 5, slippageModel = 'moderate' } = req.body as {
      delaySeconds?: number;
      slippageModel?: 'conservative' | 'moderate' | 'aggressive';
    };

    if (!isValidSolanaAddress(address)) {
      res.status(400).json({ success: false, error: 'Invalid Solana address' });
      return;
    }

    const { scoreWallet } = await import('../services/followSimulator.js');
    const result = scoreWallet(address, delaySeconds, slippageModel);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error calculating follow score:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/wallet/:address/follow-score
 * Get cached follow score for a wallet
 */
walletRouter.get('/:address/follow-score', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    if (!isValidSolanaAddress(address)) {
      res.status(400).json({ success: false, error: 'Invalid Solana address' });
      return;
    }

    const { getFollowScore } = await import('../services/followSimulator.js');
    const score = getFollowScore(address);

    if (!score) {
      res.status(404).json({ success: false, error: 'No follow score found for this wallet' });
      return;
    }

    res.json({ success: true, data: score });
  } catch (error) {
    console.error('Error getting follow score:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/wallet/:address/debug
 * Debug endpoint to fetch sample transactions and show raw data
 */
walletRouter.get('/:address/debug', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!isValidSolanaAddress(address)) {
      res.status(400).json({ success: false, error: 'Invalid Solana address' });
      return;
    }

    const helius = getHeliusService();

    // Fetch a few recent signatures
    const signatures = await helius.getSignaturesForAddress(address, { limit });
    const signatureStrings = signatures.map((s) => s.signature);

    // Parse them
    const parsed = await helius.parseTransactions(signatureStrings);

    // Show what we got
    const debugData = parsed.map((tx) => ({
      signature: tx.signature,
      type: tx.type,
      source: tx.source,
      timestamp: tx.timestamp,
      hasSwapEvent: !!tx.events?.swap,
      hasError: !!tx.transactionError,
      nativeTransfersCount: tx.nativeTransfers?.length || 0,
      tokenTransfersCount: tx.tokenTransfers?.length || 0,
      accountDataSample: tx.accountData?.slice(0, 3).map((a) => ({
        account: a.account,
        nativeBalanceChange: a.nativeBalanceChange,
        tokenBalanceChangesCount: a.tokenBalanceChanges?.length || 0,
      })),
      // Full data for first tx
      ...(signatureStrings.indexOf(tx.signature) === 0 ? { fullData: tx } : {}),
    }));

    res.json({ success: true, data: debugData });
  } catch (error) {
    console.error('Error in debug:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/wallet/:address/status
 * Get sync status for a wallet
 */
walletRouter.get('/:address/status', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    if (!isValidSolanaAddress(address)) {
      res.status(400).json({ success: false, error: 'Invalid Solana address' });
      return;
    }

    const wallet = walletQueries.getWallet.get(address) as any;
    const isSyncing = syncInProgress.has(address);

    res.json({
      success: true,
      data: {
        address,
        isSyncing,
        lastSyncedAt: wallet?.last_synced_at,
        totalTransactions: wallet?.total_transactions || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/tokens/metadata
 * Get metadata for multiple token mints
 */
walletRouter.post('/tokens/metadata', async (req: Request, res: Response) => {
  try {
    const { mints } = req.body as { mints: string[] };

    if (!Array.isArray(mints) || mints.length === 0) {
      res.status(400).json({ success: false, error: 'mints array is required' });
      return;
    }

    // Limit to 200 tokens per request
    const limitedMints = mints.slice(0, 200);

    // Check which tokens we already have in cache
    const cachedTokens = tokenQueries.getAllTokensForMints(limitedMints) as any[];
    const cachedMap = new Map(cachedTokens.map(t => [t.mint, t]));

    // Find missing tokens
    const missingMints = limitedMints.filter(m => !cachedMap.has(m));

    // Fetch missing tokens from Helius
    if (missingMints.length > 0) {
      console.log(`Fetching metadata for ${missingMints.length} tokens...`);
      const helius = getHeliusService();
      const newMetadata = await helius.getTokenMetadata(missingMints);

      // Cache the results
      const now = Math.floor(Date.now() / 1000);
      for (const meta of newMetadata) {
        tokenQueries.upsertToken.run({
          mint: meta.mint,
          symbol: meta.symbol,
          name: meta.name,
          image: meta.image,
          decimals: meta.decimals,
          fetched_at: now,
        });
        cachedMap.set(meta.mint, {
          mint: meta.mint,
          symbol: meta.symbol,
          name: meta.name,
          image: meta.image,
          decimals: meta.decimals,
        });
      }
    }

    // Build response
    const metadata: Record<string, { symbol: string | null; name: string | null; image: string | null }> = {};
    for (const mint of limitedMints) {
      const cached = cachedMap.get(mint);
      metadata[mint] = {
        symbol: cached?.symbol || null,
        name: cached?.name || null,
        image: cached?.image || null,
      };
    }

    res.json({ success: true, data: metadata });
  } catch (error) {
    console.error('Error fetching token metadata:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============ CATALOG ENDPOINTS ============

/**
 * GET /api/wallets
 * Get all wallets in the catalog
 */
walletRouter.get('/catalog/list', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || DEFAULT_USER_ID;
    const wallets = walletQueries.getAllWallets.all(userId) as any[];

    const catalogWallets: CatalogWallet[] = wallets.map(w => ({
      address: w.address,
      userId: w.user_id,
      name: w.name || '',
      emoji: w.emoji || '👛',
      alertsOn: !!w.alerts_on,
      lastSyncedAt: w.last_synced_at,
      firstSyncedAt: w.first_synced_at || undefined,
      totalTransactions: w.total_transactions || 0,
      totalRealizedPnL: w.total_realized_pnl,
      winRate: w.win_rate,
      createdAt: w.created_at || 0,
    }));

    res.json({ success: true, data: catalogWallets });
  } catch (error) {
    console.error('Error fetching catalog:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/wallets/import
 * Import wallets from JSON format
 */
walletRouter.post('/catalog/import', async (req: Request, res: Response) => {
  try {
    const { wallets, userId = DEFAULT_USER_ID } = req.body as { 
      wallets: WalletImportPayload[]; 
      userId?: string;
    };

    if (!Array.isArray(wallets) || wallets.length === 0) {
      res.status(400).json({ success: false, error: 'wallets array is required' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const imported: string[] = [];
    const failed: { address: string; error: string }[] = [];

    for (const wallet of wallets) {
      try {
        if (!isValidSolanaAddress(wallet.trackedWalletAddress)) {
          failed.push({ address: wallet.trackedWalletAddress, error: 'Invalid Solana address' });
          continue;
        }

        walletQueries.upsertWallet.run({
          address: wallet.trackedWalletAddress,
          user_id: userId,
          name: wallet.name,
          emoji: wallet.emoji,
          alerts_on: wallet.alertsOn ? 1 : 0,
          last_synced_at: null,
          first_synced_at: null,
          last_signature: null,
          total_transactions: 0,
          total_realized_pnl: null,
          win_rate: null,
          total_sol_volume: null,
          total_trades: null,
          quick_flip_rate: null,
          exited_token_rate: null,
          created_at: now,
        });

        imported.push(wallet.trackedWalletAddress);
      } catch (err) {
        failed.push({ 
          address: wallet.trackedWalletAddress, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        });
      }
    }

    res.json({ 
      success: true, 
      data: { 
        imported: imported.length, 
        failed: failed.length,
        failedDetails: failed,
      } 
    });
  } catch (error) {
    console.error('Error importing wallets:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/wallets/:address
 * Remove a wallet from the catalog
 */
walletRouter.delete('/catalog/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const userId = (req.query.userId as string) || DEFAULT_USER_ID;

    if (!isValidSolanaAddress(address)) {
      res.status(400).json({ success: false, error: 'Invalid Solana address' });
      return;
    }

    walletQueries.deleteWallet.run(address, userId);

    res.json({ success: true, data: { deleted: address } });
  } catch (error) {
    console.error('Error deleting wallet:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/wallets/:address
 * Update wallet metadata
 */
walletRouter.patch('/catalog/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const userId = (req.query.userId as string) || DEFAULT_USER_ID;
    const { name, emoji, alertsOn } = req.body;

    if (!isValidSolanaAddress(address)) {
      res.status(400).json({ success: false, error: 'Invalid Solana address' });
      return;
    }

    walletQueries.updateWalletMetadata.run({
      address,
      user_id: userId,
      name: name ?? null,
      emoji: emoji ?? null,
      alerts_on: alertsOn !== undefined ? (alertsOn ? 1 : 0) : null,
    });

    res.json({ success: true, data: { updated: address } });
  } catch (error) {
    console.error('Error updating wallet:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/wallets/bulk-analyze
 * Analyze multiple wallets and return aggregated stats
 */
walletRouter.post('/catalog/bulk-analyze', async (req: Request, res: Response) => {
  try {
    const { addresses, timeframe = 'all', userId = DEFAULT_USER_ID } = req.body as {
      addresses: string[];
      timeframe?: Timeframe;
      userId?: string;
    };

    if (!Array.isArray(addresses) || addresses.length === 0) {
      res.status(400).json({ success: false, error: 'addresses array is required' });
      return;
    }

    // Validate all addresses
    for (const addr of addresses) {
      if (!isValidSolanaAddress(addr)) {
        res.status(400).json({ success: false, error: `Invalid address: ${addr}` });
        return;
      }
    }

    const walletBreakdown: WalletPnLBreakdown[] = [];
    let totalRealizedPnL = 0;
    let totalTrades = 0;
    let totalBuys = 0;
    let totalSells = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalSolVolume = 0;

    statusEmitter.info(`Starting bulk analysis of ${addresses.length} wallets`);

    // Process each wallet sequentially to respect rate limits
    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      try {
        // Check if sync needed
        const wallet = walletQueries.getWallet.get(address, userId) as any;
        const walletDisplay = {
          address,
          name: wallet?.name || address.slice(0, 8),
          emoji: wallet?.emoji || '👛'
        };
        
        statusEmitter.progress(
          `Analyzing wallet ${i + 1}/${addresses.length}`,
          i + 1,
          addresses.length,
          walletDisplay
        );
        
        // Sync if not synced yet
        if (!wallet?.last_synced_at) {
          console.log(`Syncing wallet ${address}...`);
          await syncWalletTransactions(address, userId, false, walletDisplay);
        }

        // Get trades and summary
        const trades = getTradesForWallet(address, 'all');
        const summary = generatePnLSummary(address, trades, timeframe);

        // Get wallet metadata
        const walletData = walletQueries.getWallet.get(address, userId) as any;

        walletBreakdown.push({
          address,
          name: walletData?.name || address.slice(0, 8),
          emoji: walletData?.emoji || '👛',
          realizedPnL: summary.totalRealizedPnL,
          trades: summary.totalTrades,
          winRate: summary.winRate,
          contribution: 0, // Calculated after
        });

        totalRealizedPnL += summary.totalRealizedPnL;
        totalTrades += summary.totalTrades;
        totalBuys += summary.totalBuys;
        totalSells += summary.totalSells;
        totalWins += summary.winCount;
        totalLosses += summary.lossCount;
        totalSolVolume += summary.totalSolVolume;
      } catch (err) {
        const wallet = walletQueries.getWallet.get(address, userId) as any;
        statusEmitter.error(
          `Failed to analyze: ${err instanceof Error ? err.message : 'Unknown error'}`,
          { address, name: wallet?.name || address.slice(0, 8), emoji: wallet?.emoji || '👛' }
        );
        console.error(`Error analyzing wallet ${address}:`, err);
        // Continue with other wallets
      }
    }

    statusEmitter.success(`Bulk analysis complete! ${walletBreakdown.length} wallets analyzed`);

    // Calculate contribution percentages
    for (const breakdown of walletBreakdown) {
      breakdown.contribution = totalRealizedPnL !== 0 
        ? (breakdown.realizedPnL / Math.abs(totalRealizedPnL)) * 100 
        : 0;
    }

    // Sort by PnL descending
    walletBreakdown.sort((a, b) => b.realizedPnL - a.realizedPnL);

    const aggregatedStats: AggregatedStats = {
      totalWallets: walletBreakdown.length,
      totalRealizedPnL,
      totalTrades,
      totalBuys,
      totalSells,
      overallWinRate: totalWins + totalLosses > 0 
        ? (totalWins / (totalWins + totalLosses)) * 100 
        : 0,
      totalSolVolume,
      walletBreakdown,
    };

    res.json({ success: true, data: aggregatedStats });
  } catch (error) {
    console.error('Error in bulk analyze:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/wallets/refresh-selected
 * Refresh data for selected wallets with progress
 */
walletRouter.post('/catalog/refresh-selected', async (req: Request, res: Response) => {
  try {
    const { addresses, userId = DEFAULT_USER_ID, forceRefresh = false } = req.body as {
      addresses: string[];
      userId?: string;
      forceRefresh?: boolean;
    };

    if (!Array.isArray(addresses) || addresses.length === 0) {
      res.status(400).json({ success: false, error: 'addresses array is required' });
      return;
    }

    statusEmitter.info(`Starting ${forceRefresh ? 'full' : 'incremental'} refresh of ${addresses.length} wallets`);
    const results: { address: string; success: boolean; error?: string; trades?: number }[] = [];

    // Process sequentially with progress
    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      
      if (!isValidSolanaAddress(address)) {
        results.push({ address, success: false, error: 'Invalid address' });
        continue;
      }

      try {
        // Get wallet info for display
        const walletData = walletQueries.getWallet.get(address, userId) as any;
        const walletDisplay = {
          address,
          name: walletData?.name || address.slice(0, 8),
          emoji: walletData?.emoji || '👛'
        };
        
        statusEmitter.progress(
          `Refreshing wallet ${i + 1}/${addresses.length}`,
          i + 1,
          addresses.length,
          walletDisplay
        );
        
        console.log(`Refreshing ${i + 1}/${addresses.length}: ${address}${forceRefresh ? ' (full)' : ''})`);
        const result = await syncWalletTransactions(address, userId, forceRefresh, walletDisplay);
        results.push({ 
          address, 
          success: true, 
          trades: result.totalTrades 
        });
      } catch (err) {
        const walletData = walletQueries.getWallet.get(address, userId) as any;
        statusEmitter.error(
          `Refresh failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          { address, name: walletData?.name || address.slice(0, 8), emoji: walletData?.emoji || '👛' }
        );
        results.push({ 
          address, 
          success: false, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    statusEmitter.success(`Refresh complete! ${successCount}/${addresses.length} wallets updated`);
    
    res.json({ 
      success: true, 
      data: { 
        total: addresses.length,
        successful: successCount,
        failed: addresses.length - successCount,
        results,
      } 
    });
  } catch (error) {
    statusEmitter.error(`Refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('Error refreshing wallets:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
