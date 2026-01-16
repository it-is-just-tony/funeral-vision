// Shared types for Funeral Vision

// ============ Trade Types ============

export type TradeType = 'buy' | 'sell';

export interface Trade {
  id: string;
  walletAddress: string;
  signature: string;
  timestamp: number; // Unix timestamp in seconds
  type: TradeType;
  tokenMint: string;
  tokenSymbol?: string;
  tokenAmount: number; // Amount of token bought/sold
  solAmount: number; // SOL spent (buy) or received (sell)
  pricePerToken: number; // Price in SOL per token
  dex: string; // Jupiter, Raydium, Orca, etc.
}

// ============ Position Types ============

export interface Position {
  walletAddress: string;
  tokenMint: string;
  tokenSymbol?: string;
  totalBought: number;
  totalSold: number;
  totalCostBasis: number; // Total SOL spent
  totalProceeds: number; // Total SOL received from sells
  remainingTokens: number;
  averageBuyPrice: number;
  realizedPnL: number; // In SOL
  unrealizedPnL?: number; // If current price available
  tradeCount: number;
  winCount: number; // Number of profitable sells
  firstTradeAt: number;
  lastTradeAt: number;
}

// ============ PnL Analysis Types ============

export type Timeframe = '24h' | '7d' | '30d' | '90d' | 'all';

export interface PnLSummary {
  walletAddress: string;
  timeframe: Timeframe;
  periodStart: number;
  periodEnd: number;
  
  // Overall metrics
  totalRealizedPnL: number; // In SOL
  totalTrades: number;
  totalBuys: number;
  totalSells: number;
  
  // Win/Loss metrics
  winCount: number;
  lossCount: number;
  winRate: number; // 0-100 percentage
  
  // Volume metrics
  totalSolVolume: number; // Total SOL traded (buys + sells)
  avgTradeSize: number; // Average SOL per trade
  
  // Timing metrics
  avgHoldDuration: number; // Average seconds between buy and sell
  
  // Token diversity
  uniqueTokensTraded: number;
  
  // Best/Worst trades
  bestTrade?: Trade;
  worstTrade?: Trade;
  
  // Per-token breakdown
  positions: Position[];
}

// ============ Wallet Types ============

export interface WalletInfo {
  address: string;
  lastSyncedAt?: number;
  lastSignature?: string; // For incremental sync
  totalTransactions: number;
}

// ============ Catalog Types ============

export interface CatalogWallet {
  address: string;
  userId: string;
  name: string;
  emoji: string;
  alertsOn: boolean;
  lastSyncedAt?: number;
  firstSyncedAt?: number;
  totalTransactions: number;
  totalRealizedPnL?: number;
  winRate?: number;
  createdAt: number;
}

export interface WalletImportPayload {
  trackedWalletAddress: string;
  name: string;
  emoji: string;
  alertsOn: boolean;
}

export interface AggregatedStats {
  totalWallets: number;
  totalRealizedPnL: number;
  totalTrades: number;
  totalBuys: number;
  totalSells: number;
  overallWinRate: number;
  totalSolVolume: number;
  walletBreakdown: WalletPnLBreakdown[];
}

export interface WalletPnLBreakdown {
  address: string;
  name: string;
  emoji: string;
  realizedPnL: number;
  trades: number;
  winRate: number;
  contribution: number; // Percentage of total PnL
}

// ============ Profile Types ============

export interface WalletProfile {
  address: string;
  tokensTracked: number;
  totalTrades: number;
  totalSolVolume: number;
  dexBreakdown: Record<string, number>;
  entryLatencySeconds?: {
    p50: number;
    p90: number;
    sampleSize: number;
  };
  holdDurationsSeconds?: {
    median: number;
    p90: number;
    sampleSize: number;
  };
  earlyExitRate?: number; // fraction 0-1
  roundTripRate?: number; // fraction 0-1
}

// ============ Leaderboard / Discovery ============

export interface WalletRanking {
  address: string;
  name?: string | null;
  emoji?: string | null;
  realizedPnL: number;
  winRate: number;
  totalTrades: number;
  totalSolVolume: number;
  timeframe: Timeframe;
  quickFlipRate?: number;
  exitedTokenRate?: number;
  // Follow simulation scores
  followabilityRatio?: number;
  simulatedPnL?: number;
  avgTimeToFirstSellSec?: number;
  quickDumpRate?: number;
}

// ============ Transaction Types (from Helius) ============

export interface HeliusEnhancedTransaction {
  signature: string;
  timestamp: number;
  type: string;
  source: string;
  fee: number;
  feePayer: string;
  nativeTransfers: NativeTransfer[];
  tokenTransfers: TokenTransfer[];
  accountData: AccountData[];
  transactionError?: string | null;
  events: {
    swap?: SwapEvent;
  };
}

export interface NativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number; // In lamports
}

export interface TokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  fromTokenAccount: string;
  toTokenAccount: string;
  tokenAmount: number;
  mint: string;
  tokenStandard: string;
}

export interface AccountData {
  account: string;
  nativeBalanceChange: number;
  tokenBalanceChanges: TokenBalanceChange[];
}

export interface TokenBalanceChange {
  mint: string;
  rawTokenAmount: {
    tokenAmount: string;
    decimals: number;
  };
  tokenAccount: string;
  userAccount: string;
}

export interface SwapEvent {
  nativeInput?: {
    account: string;
    amount: string;
  };
  nativeOutput?: {
    account: string;
    amount: string;
  };
  tokenInputs: {
    mint: string;
    tokenAccount: string;
    rawTokenAmount: {
      tokenAmount: string;
      decimals: number;
    };
  }[];
  tokenOutputs: {
    mint: string;
    tokenAccount: string;
    rawTokenAmount: {
      tokenAmount: string;
      decimals: number;
    };
  }[];
  tokenFees: unknown[];
  nativeFees: unknown[];
  innerSwaps: unknown[];
}

// ============ API Response Types ============

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AnalyzeRequest {
  walletAddress: string;
  timeframe?: Timeframe;
  forceRefresh?: boolean;
}

export interface TradesResponse {
  trades: Trade[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PositionsResponse {
  positions: Position[];
}

// ============ Constants ============

export const LAMPORTS_PER_SOL = 1_000_000_000;

export const DEX_PROGRAM_IDS: Record<string, string> = {
  // Jupiter
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter v6',
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB': 'Jupiter v4',
  'JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1s32Ph': 'Jupiter v3',
  'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uN9CFi': 'Jupiter v2',
  
  // Raydium
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM',
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium CLMM',
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C': 'Raydium CPMM',
  'routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS': 'Raydium Router',
  
  // Pump.fun
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'Pump.fun',
  'BSfD6SHZigAfDWSjzD5Q41jw8LmKwtmjskPH9XW1mrRW': 'Pump.fun AMM',
  
  // Orca
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpool',
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP': 'Orca v1',
  
  // Meteora
  'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB': 'Meteora',
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': 'Meteora DLMM',
  
  // Moonshot
  'MoonCVVNZFSYkqNXP6bxHLPL6QQJiMagDL3qcqUQTrG': 'Moonshot',
  
  // Lifinity
  'EewxydAPCCVuNEyrVN68PuSYdQ7wKn27V9Gjeoi8dy3S': 'Lifinity v1',
  '2wT8Yq49kHgDzXuPxZSaeLaH1qbmGXtEyPy64bL7aD3c': 'Lifinity v2',
  
  // Phoenix
  'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY': 'Phoenix',
  
  // OpenBook
  'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX': 'OpenBook',
  'opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb': 'OpenBook v2',
  
  // Fluxbeam
  'FLUXubRmkEi2q6K3Y9kBPg9248ggaZVsoSFhtJHSrm1X': 'FluxBeam',
  
  // Sanctum (LST swaps)
  '5ocnV1qiCgaQR8Jb8xWnVbApfaygJ8tNoZfgPwsgx9kx': 'Sanctum',
};

export const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Common stablecoins and intermediate tokens (for detecting multi-hop swaps)
// These tokens are often used as routing intermediates and should be ignored
// when determining the "real" token being traded
export const INTERMEDIATE_TOKENS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA',  // USDS
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',  // USD1 (Bonk launchpad)
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',  // mSOL
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', // bSOL
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // jitoSOL
  NATIVE_SOL_MINT, // Native SOL / WSOL
]);

// Alias for backwards compatibility
export const STABLECOIN_MINTS = INTERMEDIATE_TOKENS;

// Timeframe in seconds
export const TIMEFRAME_SECONDS: Record<Timeframe, number | null> = {
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
  '90d': 90 * 24 * 60 * 60,
  'all': null,
};

// ============ Status Event Types ============

export interface StatusEvent {
  id: string;
  type: 'info' | 'progress' | 'success' | 'error' | 'warning' | 'connected';
  message: string;
  timestamp: number;
  wallet?: {
    address: string;
    name: string;
    emoji: string;
  };
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  details?: Record<string, unknown>;
}
