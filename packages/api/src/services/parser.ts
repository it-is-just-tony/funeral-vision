import type { ParsedTransactionWithMeta } from '@solana/web3.js';
import {
  type Trade,
  type HeliusEnhancedTransaction,
  LAMPORTS_PER_SOL,
  NATIVE_SOL_MINT,
  WSOL_MINT,
  DEX_PROGRAM_IDS,
  INTERMEDIATE_TOKENS,
} from '@solana-pnl/shared';

/**
 * Parse trades from Helius Enhanced Transactions
 * 
 * Strategy:
 * 1. Try to parse from token transfers (handles multi-hop swaps like Bonk launchpad)
 * 2. Fall back to accountData balance changes
 * 3. Use swap event as fallback (often incomplete for multi-hop)
 * 
 * For multi-hop swaps (e.g., SOL → USD1 → TOKEN), we look at the NET token
 * flows for the wallet, ignoring intermediate tokens like stablecoins.
 */
export function parseEnhancedTransaction(
  tx: HeliusEnhancedTransaction,
  walletAddress: string
): Trade[] {
  // Skip failed transactions
  if (tx.transactionError) {
    return [];
  }

  // Method 1: Parse from token transfers - best for multi-hop swaps
  const transferTrades = parseFromTransfers(tx, walletAddress);
  if (transferTrades.length > 0) {
    return transferTrades;
  }

  // Method 2: Parse from accountData balance changes
  const balanceChangeTrades = parseFromBalanceChanges(tx, walletAddress);
  if (balanceChangeTrades.length > 0) {
    return balanceChangeTrades;
  }

  // Method 3: Parse from swap event (often incomplete for multi-hop)
  if (tx.events?.swap) {
    const swapTrades = parseFromSwapEvent(tx, walletAddress);
    if (swapTrades.length > 0) {
      return swapTrades;
    }
  }

  return [];
}

/**
 * Parse from swap event (Jupiter-style)
 */
function parseFromSwapEvent(
  tx: HeliusEnhancedTransaction,
  walletAddress: string
): Trade[] {
  const trades: Trade[] = [];
  const swap = tx.events?.swap;
  if (!swap) return trades;

  const nativeInput = swap.nativeInput;
  const nativeOutput = swap.nativeOutput;
  const tokenInputs = swap.tokenInputs || [];
  const tokenOutputs = swap.tokenOutputs || [];

  // Buy: SOL in, token out
  if (nativeInput && tokenOutputs.length > 0) {
    const solAmount = Number(nativeInput.amount) / LAMPORTS_PER_SOL;

    for (const tokenOut of tokenOutputs) {
      if (isSOLOrWSol(tokenOut.mint)) continue;

      const tokenAmount = parseTokenAmount(tokenOut.rawTokenAmount);
      if (tokenAmount > 0 && solAmount > 0) {
        trades.push(createTrade(tx, walletAddress, 'buy', tokenOut.mint, tokenAmount, solAmount));
      }
    }
  }

  // Sell: token in, SOL out
  if (nativeOutput && tokenInputs.length > 0) {
    const solAmount = Number(nativeOutput.amount) / LAMPORTS_PER_SOL;

    for (const tokenIn of tokenInputs) {
      if (isSOLOrWSol(tokenIn.mint)) continue;

      const tokenAmount = parseTokenAmount(tokenIn.rawTokenAmount);
      if (tokenAmount > 0 && solAmount > 0) {
        trades.push(createTrade(tx, walletAddress, 'sell', tokenIn.mint, tokenAmount, solAmount));
      }
    }
  }

  return trades;
}

/**
 * Parse from accountData balance changes - most reliable method
 * Works for Pump.fun, Raydium, Orca, Meteora, etc.
 * 
 * Note: Token balance changes are indexed by userAccount, not by the account field
 */
function parseFromBalanceChanges(
  tx: HeliusEnhancedTransaction,
  walletAddress: string
): Trade[] {
  const trades: Trade[] = [];
  
  // Calculate total SOL change for wallet
  let solChange = 0;
  for (const acc of tx.accountData || []) {
    if (acc.account === walletAddress) {
      solChange += (acc.nativeBalanceChange || 0) / LAMPORTS_PER_SOL;
    }
  }
  
  // Find token balance changes where userAccount matches our wallet
  // Note: tokenBalanceChanges are nested in accountData but indexed by userAccount
  const tokenChanges: Map<string, number> = new Map();
  
  for (const acc of tx.accountData || []) {
    for (const tbc of acc.tokenBalanceChanges || []) {
      // Match by userAccount, not the account field
      if (tbc.userAccount === walletAddress) {
        if (isSOLOrWSol(tbc.mint)) continue;
        
        const amount = parseTokenAmount(tbc.rawTokenAmount);
        const existing = tokenChanges.get(tbc.mint) || 0;
        tokenChanges.set(tbc.mint, existing + amount);
      }
    }
  }

  if (tokenChanges.size === 0) return trades;

  // Create trades based on flows
  for (const [mint, tokenDelta] of tokenChanges) {
    if (Math.abs(tokenDelta) < 0.000001) continue;

    // Buy: SOL decreased (or no change for free mints), token increased
    if (tokenDelta > 0) {
      const solSpent = Math.abs(solChange);
      // Even if SOL change is 0 (airdrop/free mint), record as buy with 0 cost
      trades.push(createTrade(tx, walletAddress, 'buy', mint, tokenDelta, solSpent));
    }
    // Sell: token decreased
    else if (tokenDelta < 0) {
      const solReceived = Math.max(0, solChange);
      trades.push(createTrade(tx, walletAddress, 'sell', mint, Math.abs(tokenDelta), solReceived));
    }
  }

  return trades;
}

/**
 * Parse from token transfers and native transfers
 * 
 * This is the primary method for detecting trades, especially multi-hop swaps
 * like Bonk launchpad (SOL → USD1 → TOKEN).
 * 
 * Strategy:
 * 1. Calculate net SOL/WSOL flow for the wallet
 * 2. Calculate net token flows, IGNORING intermediate tokens (stablecoins, LSTs)
 * 3. Match SOL flows with non-intermediate token flows to identify buys/sells
 */
function parseFromTransfers(
  tx: HeliusEnhancedTransaction,
  walletAddress: string
): Trade[] {
  const trades: Trade[] = [];

  // Calculate net SOL flow for wallet (native transfers)
  let solDelta = 0;
  for (const transfer of tx.nativeTransfers || []) {
    if (transfer.fromUserAccount === walletAddress) {
      solDelta -= transfer.amount / LAMPORTS_PER_SOL;
    }
    if (transfer.toUserAccount === walletAddress) {
      solDelta += transfer.amount / LAMPORTS_PER_SOL;
    }
  }

  // Calculate net token flows for wallet
  // Track ALL tokens first, then filter
  const tokenDeltas: Map<string, number> = new Map();
  
  for (const transfer of tx.tokenTransfers || []) {
    const currentDelta = tokenDeltas.get(transfer.mint) || 0;
    
    if (transfer.fromUserAccount === walletAddress) {
      tokenDeltas.set(transfer.mint, currentDelta - transfer.tokenAmount);
    }
    if (transfer.toUserAccount === walletAddress) {
      tokenDeltas.set(transfer.mint, currentDelta + transfer.tokenAmount);
    }
  }

  // Add WSOL flows to SOL delta (WSOL is functionally SOL)
  const wsolDelta = tokenDeltas.get(WSOL_MINT) || 0;
  solDelta += wsolDelta;
  tokenDeltas.delete(WSOL_MINT);
  tokenDeltas.delete(NATIVE_SOL_MINT);

  // Separate tokens into:
  // 1. Intermediate tokens (stablecoins, LSTs) - used for routing
  // 2. Target tokens - what we actually want to track
  const intermediateDeltas: Map<string, number> = new Map();
  const targetDeltas: Map<string, number> = new Map();

  for (const [mint, delta] of tokenDeltas) {
    if (Math.abs(delta) < 0.000001) continue; // Skip dust
    
    if (INTERMEDIATE_TOKENS.has(mint)) {
      intermediateDeltas.set(mint, delta);
    } else {
      targetDeltas.set(mint, delta);
    }
  }

  // If we have target tokens with SOL flow, create trades
  if (targetDeltas.size > 0 && Math.abs(solDelta) > 0.0001) {
    // Distribute SOL proportionally among target tokens
    const totalTargetValue = Array.from(targetDeltas.values())
      .reduce((sum, d) => sum + Math.abs(d), 0);

    for (const [mint, tokenDelta] of targetDeltas) {
      // Calculate proportional SOL amount
      const proportion = Math.abs(tokenDelta) / totalTargetValue;
      const proportionalSol = Math.abs(solDelta) * proportion;

      // Buy: SOL out, token in
      if (solDelta < 0 && tokenDelta > 0) {
        trades.push(createTrade(tx, walletAddress, 'buy', mint, tokenDelta, proportionalSol));
      }
      // Sell: SOL in, token out
      else if (solDelta > 0 && tokenDelta < 0) {
        trades.push(createTrade(tx, walletAddress, 'sell', mint, Math.abs(tokenDelta), proportionalSol));
      }
    }
  }
  // Special case: target tokens with no direct SOL flow but intermediate flow
  // (e.g., SOL→USD1→TOKEN where we see USD1 flow but need to track TOKEN)
  else if (targetDeltas.size > 0 && intermediateDeltas.size > 0) {
    // Calculate total intermediate token value as proxy for SOL
    // For now, assume 1:1 for stablecoins (this could be improved with price feeds)
    let intermediateValue = 0;
    let intermediateDirection = 0; // positive = received, negative = sent
    
    for (const [, delta] of intermediateDeltas) {
      intermediateValue += Math.abs(delta);
      intermediateDirection += delta;
    }

    // Use intermediate as proxy for SOL
    // If user sent intermediate and received target = buy
    // If user received intermediate and sent target = sell
    for (const [mint, tokenDelta] of targetDeltas) {
      const proportion = Math.abs(tokenDelta) / Array.from(targetDeltas.values())
        .reduce((sum, d) => sum + Math.abs(d), 0);
      const proportionalValue = intermediateValue * proportion;

      // Buy: sent intermediate (or SOL), received target token
      if (intermediateDirection < 0 && tokenDelta > 0) {
        // Try to get SOL value, otherwise use intermediate
        const solValue = Math.abs(solDelta) > 0.0001 ? Math.abs(solDelta) : proportionalValue / 100; // rough USD to SOL
        trades.push(createTrade(tx, walletAddress, 'buy', mint, tokenDelta, solValue));
      }
      // Sell: received intermediate (or SOL), sent target token
      else if (intermediateDirection > 0 && tokenDelta < 0) {
        const solValue = solDelta > 0.0001 ? solDelta : proportionalValue / 100;
        trades.push(createTrade(tx, walletAddress, 'sell', mint, Math.abs(tokenDelta), solValue));
      }
    }
  }
  // Fallback: target tokens with zero SOL flow (airdrops, free mints)
  else if (targetDeltas.size > 0) {
    for (const [mint, tokenDelta] of targetDeltas) {
      if (tokenDelta > 0) {
        // Received token with no SOL cost = airdrop/free mint
        trades.push(createTrade(tx, walletAddress, 'buy', mint, tokenDelta, 0));
      }
    }
  }

  return trades;
}

/**
 * Create a trade object
 */
function createTrade(
  tx: HeliusEnhancedTransaction,
  walletAddress: string,
  type: 'buy' | 'sell',
  tokenMint: string,
  tokenAmount: number,
  solAmount: number
): Trade {
  return {
    id: `${tx.signature}-${type}-${tokenMint}`,
    walletAddress,
    signature: tx.signature,
    timestamp: tx.timestamp,
    type,
    tokenMint,
    tokenAmount,
    solAmount,
    pricePerToken: solAmount / tokenAmount,
    dex: detectDex(tx),
  };
}

/**
 * Detect which DEX was used
 */
function detectDex(tx: HeliusEnhancedTransaction): string {
  // Check source field first
  if (tx.source) {
    const sourceUpper = tx.source.toUpperCase();
    if (sourceUpper.includes('JUPITER')) return 'Jupiter';
    if (sourceUpper.includes('RAYDIUM')) return 'Raydium';
    if (sourceUpper.includes('PUMP') || sourceUpper.includes('PUMPFUN')) return 'Pump.fun';
    if (sourceUpper.includes('ORCA')) return 'Orca';
    if (sourceUpper.includes('METEORA')) return 'Meteora';
    if (sourceUpper.includes('MOONSHOT')) return 'Moonshot';
    if (sourceUpper.includes('PHOENIX')) return 'Phoenix';
    if (sourceUpper.includes('LIFINITY')) return 'Lifinity';
    return tx.source;
  }

  // Check transaction type
  if (tx.type) {
    const typeUpper = tx.type.toUpperCase();
    if (typeUpper.includes('SWAP')) return 'DEX Swap';
  }

  return 'Unknown';
}

/**
 * Check if mint is SOL or wrapped SOL
 */
function isSOLOrWSol(mint: string): boolean {
  return mint === NATIVE_SOL_MINT || mint === WSOL_MINT || mint === '11111111111111111111111111111111';
}

/**
 * Parse token amount from raw token amount object
 */
function parseTokenAmount(rawAmount: { tokenAmount: string; decimals: number } | undefined): number {
  if (!rawAmount) return 0;
  return Number(rawAmount.tokenAmount) / Math.pow(10, rawAmount.decimals);
}

/**
 * Parse trades from raw parsed transaction (fallback for when Helius doesn't parse)
 */
export function parseRawTransaction(
  tx: ParsedTransactionWithMeta,
  signature: string,
  walletAddress: string
): Trade[] {
  const trades: Trade[] = [];

  if (!tx || !tx.meta) return trades;

  const { preBalances, postBalances, preTokenBalances, postTokenBalances } = tx.meta;

  // Find wallet's account index
  const accountKeys = tx.transaction.message.accountKeys;
  const walletIndex = accountKeys.findIndex(
    (key: any) => key.pubkey.toString() === walletAddress
  );

  if (walletIndex === -1) return trades;

  // Calculate SOL change for wallet
  const solChange = (postBalances[walletIndex] - preBalances[walletIndex]) / LAMPORTS_PER_SOL;

  // Calculate token changes for wallet
  const tokenChanges: Map<string, { amount: number; decimals: number }> = new Map();

  // Process pre-balances
  const preTokenMap: Map<number, { mint: string; amount: number; decimals: number }> = new Map();
  for (const pre of preTokenBalances || []) {
    if (pre.owner === walletAddress) {
      preTokenMap.set(pre.accountIndex, {
        mint: pre.mint,
        amount: Number(pre.uiTokenAmount.uiAmount || 0),
        decimals: pre.uiTokenAmount.decimals,
      });
    }
  }

  // Process post-balances and calculate changes
  for (const post of postTokenBalances || []) {
    if (post.owner === walletAddress) {
      const pre = preTokenMap.get(post.accountIndex);
      const preAmount = pre?.amount || 0;
      const postAmount = Number(post.uiTokenAmount.uiAmount || 0);
      const change = postAmount - preAmount;

      if (Math.abs(change) > 0.000001) {
        const existing = tokenChanges.get(post.mint);
        if (existing) {
          existing.amount += change;
        } else {
          tokenChanges.set(post.mint, {
            amount: change,
            decimals: post.uiTokenAmount.decimals,
          });
        }
      }
    }
  }

  // Check for closed token accounts
  for (const [accountIndex, pre] of preTokenMap) {
    const hasPost = (postTokenBalances || []).some(
      (p: any) => p.accountIndex === accountIndex && p.owner === walletAddress
    );
    if (!hasPost && pre.amount > 0) {
      const existing = tokenChanges.get(pre.mint);
      if (existing) {
        existing.amount -= pre.amount;
      } else {
        tokenChanges.set(pre.mint, {
          amount: -pre.amount,
          decimals: pre.decimals,
        });
      }
    }
  }

  // Determine DEX from program IDs
  let dex = 'Unknown';
  for (const instruction of tx.transaction.message.instructions) {
    const programId = instruction.programId.toString();
    if (DEX_PROGRAM_IDS[programId]) {
      dex = DEX_PROGRAM_IDS[programId];
      break;
    }
  }

  const blockTime = tx.blockTime || Math.floor(Date.now() / 1000);

  // Generate trades from token changes
  for (const [mint, change] of tokenChanges) {
    if (isSOLOrWSol(mint)) continue;

    const tokenAmount = Math.abs(change.amount);
    const absSolChange = Math.abs(solChange);

    if (absSolChange < 0.0001 || tokenAmount < 0.000001) continue;

    if (change.amount > 0 && solChange < 0) {
      // Buy
      trades.push({
        id: `${signature}-buy-${mint}`,
        walletAddress,
        signature,
        timestamp: blockTime,
        type: 'buy',
        tokenMint: mint,
        tokenAmount,
        solAmount: absSolChange,
        pricePerToken: absSolChange / tokenAmount,
        dex,
      });
    } else if (change.amount < 0 && solChange > 0) {
      // Sell
      trades.push({
        id: `${signature}-sell-${mint}`,
        walletAddress,
        signature,
        timestamp: blockTime,
        type: 'sell',
        tokenMint: mint,
        tokenAmount,
        solAmount: absSolChange,
        pricePerToken: absSolChange / tokenAmount,
        dex,
      });
    }
  }

  return trades;
}

/**
 * Batch parse enhanced transactions
 */
export function parseEnhancedTransactions(
  transactions: HeliusEnhancedTransaction[],
  walletAddress: string
): Trade[] {
  const allTrades: Trade[] = [];
  let parsedCount = 0;
  let skippedCount = 0;

  for (const tx of transactions) {
    const trades = parseEnhancedTransaction(tx, walletAddress);
    if (trades.length > 0) {
      allTrades.push(...trades);
      parsedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`Parsed ${parsedCount} transactions with trades, skipped ${skippedCount} non-trade transactions`);
  return allTrades;
}
