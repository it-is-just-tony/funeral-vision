import Database, { type Database as DatabaseType, type Statement } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Re-export types so generated declarations can reference them
export type BetterSqlite3Database = DatabaseType;
export type BetterSqlite3Statement = Statement;

const fileDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(fileDir, '../../../../');

function resolveDbPath(rawPath: string): string {
  if (path.isAbsolute(rawPath)) return rawPath;

  const cwdPath = path.resolve(process.cwd(), rawPath);
  const rootPath = path.resolve(repoRoot, rawPath);

  if (rawPath.includes('packages/api/data')) {
    const duplicateSegment = path.join('packages', 'api', 'packages', 'api');
    if (cwdPath.includes(duplicateSegment) && fs.existsSync(rootPath)) {
      return rootPath;
    }
  }

  if (fs.existsSync(cwdPath)) return cwdPath;
  if (fs.existsSync(rootPath)) return rootPath;
  return cwdPath;
}

const fallbackPath = (() => {
  const rootDefault = './data/pnl.db';
  const workspaceDefault = './packages/api/data/pnl.db';
  if (fs.existsSync(path.resolve(process.cwd(), rootDefault))) return rootDefault;
  if (fs.existsSync(path.resolve(process.cwd(), workspaceDefault))) return workspaceDefault;
  return rootDefault;
})();

const DB_PATH = resolveDbPath(process.env.DATABASE_PATH || fallbackPath);

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(DB_PATH);

// Initialize tables immediately
db.pragma('journal_mode = WAL');

db.exec(`
  -- Users table for multi-user support
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    created_at INTEGER NOT NULL
  );

  -- Wallets table for tracking sync state and catalog metadata
  CREATE TABLE IF NOT EXISTS wallets (
    address TEXT NOT NULL,
    user_id TEXT NOT NULL DEFAULT 'default',
    name TEXT,
    emoji TEXT,
    alerts_on INTEGER DEFAULT 0,
    last_synced_at INTEGER,
    last_signature TEXT,
    total_transactions INTEGER DEFAULT 0,
    total_realized_pnl REAL,
    win_rate REAL,
    created_at INTEGER,
    PRIMARY KEY (address, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Ensure default user exists
  INSERT OR IGNORE INTO users (id, name, created_at) VALUES ('default', 'Default User', strftime('%s', 'now'));

  -- Raw transactions cache
  CREATE TABLE IF NOT EXISTS transactions (
    signature TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    block_slot INTEGER,
    raw_data TEXT NOT NULL,
    parsed INTEGER DEFAULT 0
  );

  -- Parsed trades
  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    signature TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
    token_mint TEXT NOT NULL,
    token_symbol TEXT,
    token_amount REAL NOT NULL,
    sol_amount REAL NOT NULL,
    price_per_token REAL NOT NULL,
    dex TEXT
  );

  -- Aggregated positions (computed from trades)
  CREATE TABLE IF NOT EXISTS positions (
    wallet_address TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    token_symbol TEXT,
    total_bought REAL DEFAULT 0,
    total_sold REAL DEFAULT 0,
    total_cost_basis REAL DEFAULT 0,
    total_proceeds REAL DEFAULT 0,
    remaining_tokens REAL DEFAULT 0,
    average_buy_price REAL DEFAULT 0,
    realized_pnl REAL DEFAULT 0,
    trade_count INTEGER DEFAULT 0,
    win_count INTEGER DEFAULT 0,
    first_trade_at INTEGER,
    last_trade_at INTEGER,
    PRIMARY KEY (wallet_address, token_mint)
  );

  -- Cost basis lots for FIFO calculation
  CREATE TABLE IF NOT EXISTS cost_basis_lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    trade_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    amount REAL NOT NULL,
    remaining_amount REAL NOT NULL,
    price_per_token REAL NOT NULL
  );

  -- Token metadata cache
  CREATE TABLE IF NOT EXISTS token_metadata (
    mint TEXT PRIMARY KEY,
    symbol TEXT,
    name TEXT,
    image TEXT,
    decimals INTEGER,
    fetched_at INTEGER NOT NULL
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address);
  CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
  CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet_address);
  CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
  CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(token_mint);
  CREATE INDEX IF NOT EXISTS idx_cost_basis_wallet_token ON cost_basis_lots(wallet_address, token_mint);

  -- Token first-seen cache (built from stored raw transactions to avoid extra RPC/API hits)
  CREATE TABLE IF NOT EXISTS token_launches (
    mint TEXT PRIMARY KEY,
    first_signature TEXT,
    first_timestamp INTEGER,
    first_slot INTEGER,
    source TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_token_launch_first_ts ON token_launches(first_timestamp);

  -- Wallet follow simulation scores
  CREATE TABLE IF NOT EXISTS wallet_follow_scores (
    wallet_address TEXT PRIMARY KEY,

    -- Simulation config used
    delay_seconds INTEGER NOT NULL,
    slippage_model TEXT NOT NULL,

    -- Core results
    actual_pnl REAL,
    simulated_pnl REAL,
    followability_ratio REAL,

    -- Timing analysis
    avg_time_to_first_sell_sec REAL,
    median_time_to_first_sell_sec REAL,
    quick_dump_rate REAL,

    -- Volume breakdown
    total_tokens_traded INTEGER,
    followable_tokens INTEGER,
    unfollowable_tokens INTEGER,

    -- Position sizing
    avg_entry_size_sol REAL,

    scored_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_follow_scores_ratio ON wallet_follow_scores(followability_ratio DESC);
`);

// Migration: Add total_sol_volume and total_trades columns if they don't exist
// Using pragma to check columns safely preserves existing data
const walletColumns = db.prepare("PRAGMA table_info(wallets)").all() as { name: string }[];
const columnNames = new Set(walletColumns.map(c => c.name));

if (!columnNames.has('total_sol_volume')) {
  db.exec('ALTER TABLE wallets ADD COLUMN total_sol_volume REAL DEFAULT 0');
  console.log('📦 Added total_sol_volume column to wallets table');
}

if (!columnNames.has('total_trades')) {
  db.exec('ALTER TABLE wallets ADD COLUMN total_trades INTEGER DEFAULT 0');
  console.log('📦 Added total_trades column to wallets table');
}

if (!columnNames.has('quick_flip_rate')) {
  db.exec('ALTER TABLE wallets ADD COLUMN quick_flip_rate REAL');
  console.log('📦 Added quick_flip_rate column to wallets table');
}

if (!columnNames.has('exited_token_rate')) {
  db.exec('ALTER TABLE wallets ADD COLUMN exited_token_rate REAL');
  console.log('📦 Added exited_token_rate column to wallets table');
}

if (!columnNames.has('first_synced_at')) {
  db.exec('ALTER TABLE wallets ADD COLUMN first_synced_at INTEGER');
  console.log('📦 Added first_synced_at column to wallets table');

  // Backfill from transactions table
  db.exec(`
    UPDATE wallets
    SET first_synced_at = (
      SELECT MIN(timestamp) FROM transactions WHERE transactions.wallet_address = wallets.address
    )
    WHERE first_synced_at IS NULL
  `);
  console.log('📦 Backfilled first_synced_at from transactions');
}

// Backfill total_sol_volume and total_trades from trades table for wallets missing this data
db.exec(`
  UPDATE wallets
  SET
    total_sol_volume = COALESCE((
      SELECT SUM(sol_amount) FROM trades WHERE trades.wallet_address = wallets.address
    ), 0),
    total_trades = COALESCE((
      SELECT COUNT(*) FROM trades WHERE trades.wallet_address = wallets.address
    ), 0)
  WHERE total_sol_volume IS NULL OR total_sol_volume = 0
`);

console.log(`✅ Database initialized at ${DB_PATH}`);

export function initDatabase(): void {
  // Tables are created on module load, this is just for API compatibility
  console.log('📊 Database ready');
}

/**
 * Backfill behavior stats (quick_flip_rate, exited_token_rate) for wallets missing this data.
 * Must be called after all modules are loaded to avoid circular dependencies.
 */
export function backfillBehaviorStats(
  buildWalletProfile: (address: string) => { earlyExitRate?: number; roundTripRate?: number }
): void {
  const walletsNeedingBackfill = db.prepare(`
    SELECT address FROM wallets
    WHERE quick_flip_rate IS NULL AND total_trades > 0
  `).all() as { address: string }[];

  if (walletsNeedingBackfill.length === 0) return;

  console.log(`📦 Backfilling behavior stats for ${walletsNeedingBackfill.length} wallets...`);

  const updateStmt = db.prepare(`
    UPDATE wallets SET quick_flip_rate = @quick_flip_rate, exited_token_rate = @exited_token_rate
    WHERE address = @address
  `);

  for (const { address } of walletsNeedingBackfill) {
    try {
      const profile = buildWalletProfile(address);
      updateStmt.run({
        address,
        quick_flip_rate: profile.earlyExitRate ?? null,
        exited_token_rate: profile.roundTripRate ?? null,
      });
    } catch (err) {
      console.warn(`Failed to backfill behavior stats for ${address}:`, err);
    }
  }

  console.log(`✅ Behavior stats backfill complete`);
}

// Wallet queries
export const walletQueries = {
  getWallet: db.prepare('SELECT * FROM wallets WHERE address = ? AND user_id = ?'),
  getWalletByAddress: db.prepare('SELECT * FROM wallets WHERE address = ? AND user_id = ?'),
  upsertWallet: db.prepare(`
    INSERT INTO wallets (address, user_id, name, emoji, alerts_on, last_synced_at, first_synced_at, last_signature, total_transactions, total_realized_pnl, win_rate, total_sol_volume, total_trades, quick_flip_rate, exited_token_rate, created_at)
    VALUES (@address, @user_id, @name, @emoji, @alerts_on, @last_synced_at, @first_synced_at, @last_signature, @total_transactions, @total_realized_pnl, @win_rate, @total_sol_volume, @total_trades, @quick_flip_rate, @exited_token_rate, @created_at)
    ON CONFLICT(address, user_id) DO UPDATE SET
      name = COALESCE(@name, name),
      emoji = COALESCE(@emoji, emoji),
      alerts_on = COALESCE(@alerts_on, alerts_on),
      last_synced_at = COALESCE(@last_synced_at, last_synced_at),
      first_synced_at = COALESCE(first_synced_at, @first_synced_at),
      last_signature = COALESCE(@last_signature, last_signature),
      total_transactions = COALESCE(@total_transactions, total_transactions),
      total_realized_pnl = COALESCE(@total_realized_pnl, total_realized_pnl),
      win_rate = COALESCE(@win_rate, win_rate),
      total_sol_volume = COALESCE(@total_sol_volume, total_sol_volume),
      total_trades = COALESCE(@total_trades, total_trades),
      quick_flip_rate = COALESCE(@quick_flip_rate, quick_flip_rate),
      exited_token_rate = COALESCE(@exited_token_rate, exited_token_rate)
  `),
  updateWalletStats: db.prepare(`
    UPDATE wallets SET
      last_synced_at = @last_synced_at,
      first_synced_at = COALESCE(first_synced_at, @first_synced_at),
      last_signature = @last_signature,
      total_transactions = @total_transactions,
      total_realized_pnl = @total_realized_pnl,
      win_rate = @win_rate,
      total_sol_volume = @total_sol_volume,
      total_trades = @total_trades,
      quick_flip_rate = @quick_flip_rate,
      exited_token_rate = @exited_token_rate
    WHERE address = @address AND user_id = @user_id
  `),
  getAllWallets: db.prepare('SELECT * FROM wallets WHERE user_id = ? ORDER BY created_at DESC'),
  deleteWallet: db.prepare('DELETE FROM wallets WHERE address = ? AND user_id = ?'),
  updateWalletMetadata: db.prepare(`
    UPDATE wallets SET name = @name, emoji = @emoji, alerts_on = @alerts_on
    WHERE address = @address AND user_id = @user_id
  `),
};

// Transaction queries
export const txQueries = {
  insertTransaction: db.prepare(`
    INSERT OR IGNORE INTO transactions (signature, wallet_address, timestamp, block_slot, raw_data, parsed)
    VALUES (@signature, @wallet_address, @timestamp, @block_slot, @raw_data, @parsed)
  `),
  getUnparsedTransactions: db.prepare(`
    SELECT * FROM transactions WHERE wallet_address = ? AND parsed = 0 ORDER BY timestamp ASC
  `),
  markParsed: db.prepare('UPDATE transactions SET parsed = 1 WHERE signature = ?'),
  getLatestSignature: db.prepare(`
    SELECT signature FROM transactions WHERE wallet_address = ? ORDER BY timestamp DESC LIMIT 1
  `),
  getEarliestTimestamp: db.prepare(`
    SELECT MIN(timestamp) as first_timestamp FROM transactions WHERE wallet_address = ?
  `),
};

// Trade queries
export const tradeQueries = {
  insertTrade: db.prepare(`
    INSERT OR REPLACE INTO trades (id, wallet_address, signature, timestamp, type, token_mint, token_symbol, token_amount, sol_amount, price_per_token, dex)
    VALUES (@id, @wallet_address, @signature, @timestamp, @type, @token_mint, @token_symbol, @token_amount, @sol_amount, @price_per_token, @dex)
  `),
  getTradesByWallet: db.prepare(`
    SELECT * FROM trades WHERE wallet_address = ? ORDER BY timestamp DESC
  `),
  getTradesByWalletAndTimeframe: db.prepare(`
    SELECT * FROM trades WHERE wallet_address = ? AND timestamp >= ? ORDER BY timestamp DESC
  `),
  getTradesByToken: db.prepare(`
    SELECT * FROM trades WHERE wallet_address = ? AND token_mint = ? ORDER BY timestamp ASC
  `),
};

// Position queries
export const positionQueries = {
  upsertPosition: db.prepare(`
    INSERT INTO positions (wallet_address, token_mint, token_symbol, total_bought, total_sold, total_cost_basis, total_proceeds, remaining_tokens, average_buy_price, realized_pnl, trade_count, win_count, first_trade_at, last_trade_at)
    VALUES (@wallet_address, @token_mint, @token_symbol, @total_bought, @total_sold, @total_cost_basis, @total_proceeds, @remaining_tokens, @average_buy_price, @realized_pnl, @trade_count, @win_count, @first_trade_at, @last_trade_at)
    ON CONFLICT(wallet_address, token_mint) DO UPDATE SET
      token_symbol = @token_symbol,
      total_bought = @total_bought,
      total_sold = @total_sold,
      total_cost_basis = @total_cost_basis,
      total_proceeds = @total_proceeds,
      remaining_tokens = @remaining_tokens,
      average_buy_price = @average_buy_price,
      realized_pnl = @realized_pnl,
      trade_count = @trade_count,
      win_count = @win_count,
      first_trade_at = @first_trade_at,
      last_trade_at = @last_trade_at
  `),
  getPositionsByWallet: db.prepare(`
    SELECT * FROM positions WHERE wallet_address = ? ORDER BY realized_pnl DESC
  `),
  deletePositionsByWallet: db.prepare('DELETE FROM positions WHERE wallet_address = ?'),
};

// Cost basis lot queries
export const lotQueries = {
  insertLot: db.prepare(`
    INSERT INTO cost_basis_lots (wallet_address, token_mint, trade_id, timestamp, amount, remaining_amount, price_per_token)
    VALUES (@wallet_address, @token_mint, @trade_id, @timestamp, @amount, @remaining_amount, @price_per_token)
  `),
  getLotsForToken: db.prepare(`
    SELECT * FROM cost_basis_lots 
    WHERE wallet_address = ? AND token_mint = ? AND remaining_amount > 0 
    ORDER BY timestamp ASC
  `),
  updateLotRemaining: db.prepare('UPDATE cost_basis_lots SET remaining_amount = ? WHERE id = ?'),
  deleteLotsByWallet: db.prepare('DELETE FROM cost_basis_lots WHERE wallet_address = ?'),
};

// Token metadata queries
export const tokenQueries = {
  getToken: db.prepare('SELECT * FROM token_metadata WHERE mint = ?'),
  getTokens: db.prepare(`SELECT * FROM token_metadata WHERE mint IN (${Array(100).fill('?').join(',')})`),
  upsertToken: db.prepare(`
    INSERT INTO token_metadata (mint, symbol, name, image, decimals, fetched_at)
    VALUES (@mint, @symbol, @name, @image, @decimals, @fetched_at)
    ON CONFLICT(mint) DO UPDATE SET
      symbol = @symbol,
      name = @name,
      image = @image,
      decimals = @decimals,
      fetched_at = @fetched_at
  `),
  getMissingTokens: (mints: string[]) => {
    if (mints.length === 0) return [];
    const placeholders = mints.map(() => '?').join(',');
    const existing = db.prepare(`SELECT mint FROM token_metadata WHERE mint IN (${placeholders})`).all(...mints) as { mint: string }[];
    const existingSet = new Set(existing.map(t => t.mint));
    return mints.filter(m => !existingSet.has(m));
  },
  getAllTokensForMints: (mints: string[]) => {
    if (mints.length === 0) return [];
    const placeholders = mints.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM token_metadata WHERE mint IN (${placeholders})`).all(...mints);
  },
};

// Token launch queries (first-seen cache)
export const tokenLaunchQueries = {
  upsertTokenLaunch: db.prepare(`
    INSERT INTO token_launches (mint, first_signature, first_timestamp, first_slot, source)
    VALUES (@mint, @first_signature, @first_timestamp, @first_slot, @source)
    ON CONFLICT(mint) DO UPDATE SET
      first_signature = CASE 
        WHEN excluded.first_timestamp < token_launches.first_timestamp OR token_launches.first_timestamp IS NULL 
        THEN excluded.first_signature ELSE token_launches.first_signature END,
      first_timestamp = CASE 
        WHEN excluded.first_timestamp < token_launches.first_timestamp OR token_launches.first_timestamp IS NULL 
        THEN excluded.first_timestamp ELSE token_launches.first_timestamp END,
      first_slot = CASE 
        WHEN excluded.first_timestamp < token_launches.first_timestamp OR token_launches.first_timestamp IS NULL 
        THEN excluded.first_slot ELSE token_launches.first_slot END,
      source = COALESCE(token_launches.source, excluded.source)
  `),
  getLaunch: db.prepare('SELECT * FROM token_launches WHERE mint = ?'),
  getLaunchesForMints: (mints: string[]) => {
    if (mints.length === 0) return [];
    const placeholders = mints.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM token_launches WHERE mint IN (${placeholders})`).all(...mints);
  },
  getAllLaunches: db.prepare('SELECT * FROM token_launches'),
};

// Follow score queries
export const followScoreQueries = {
  upsertScore: db.prepare(`
    INSERT INTO wallet_follow_scores (
      wallet_address, delay_seconds, slippage_model,
      actual_pnl, simulated_pnl, followability_ratio,
      avg_time_to_first_sell_sec, median_time_to_first_sell_sec, quick_dump_rate,
      total_tokens_traded, followable_tokens, unfollowable_tokens,
      avg_entry_size_sol, scored_at
    ) VALUES (
      @wallet_address, @delay_seconds, @slippage_model,
      @actual_pnl, @simulated_pnl, @followability_ratio,
      @avg_time_to_first_sell_sec, @median_time_to_first_sell_sec, @quick_dump_rate,
      @total_tokens_traded, @followable_tokens, @unfollowable_tokens,
      @avg_entry_size_sol, @scored_at
    )
    ON CONFLICT(wallet_address) DO UPDATE SET
      delay_seconds = @delay_seconds,
      slippage_model = @slippage_model,
      actual_pnl = @actual_pnl,
      simulated_pnl = @simulated_pnl,
      followability_ratio = @followability_ratio,
      avg_time_to_first_sell_sec = @avg_time_to_first_sell_sec,
      median_time_to_first_sell_sec = @median_time_to_first_sell_sec,
      quick_dump_rate = @quick_dump_rate,
      total_tokens_traded = @total_tokens_traded,
      followable_tokens = @followable_tokens,
      unfollowable_tokens = @unfollowable_tokens,
      avg_entry_size_sol = @avg_entry_size_sol,
      scored_at = @scored_at
  `),
  getScore: db.prepare('SELECT * FROM wallet_follow_scores WHERE wallet_address = ?'),
  getAllScores: db.prepare('SELECT * FROM wallet_follow_scores ORDER BY followability_ratio DESC'),
  getTopScores: db.prepare('SELECT * FROM wallet_follow_scores WHERE followability_ratio > 0 ORDER BY followability_ratio DESC LIMIT ?'),
  deleteScore: db.prepare('DELETE FROM wallet_follow_scores WHERE wallet_address = ?'),
};
