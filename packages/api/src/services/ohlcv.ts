import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ohlcvQueries, db } from '../db/index.js';

export type OhlcvInterval = '1s' | '5s' | '15s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

interface OhlcvCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const API_BASE = 'https://data.solanatracker.io';

// Ensure .env is loaded even if this module is imported before app bootstrap
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
const MIN_REQUEST_INTERVAL_MS = 1100;

let lastRequestAt = 0;
let requestChain: Promise<void> = Promise.resolve();

function intervalToSeconds(interval: OhlcvInterval): number {
  switch (interval) {
    case '1s': return 1;
    case '5s': return 5;
    case '15s': return 15;
    case '1m': return 60;
    case '5m': return 300;
    case '15m': return 900;
    case '1h': return 3600;
    case '4h': return 14400;
    case '1d': return 86400;
    default: return 60;
  }
}

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  let result!: T;
  await (requestChain = requestChain.then(async () => {
    await rateLimit();
    try {
      result = await fn();
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 429) {
        const backoffMs = 1500;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        await rateLimit();
        result = await fn();
      } else {
        throw error;
      }
    }
  }));
  return result;
}

async function fetchOhlcvFromSolanaTracker(
  tokenMint: string,
  interval: OhlcvInterval,
  fromTs: number,
  toTs: number
): Promise<OhlcvCandle[]> {
  const apiKey = process.env.SOLANA_TRACKER_API_KEY;
  if (!apiKey) {
    throw new Error('SOLANA_TRACKER_API_KEY is not set');
  }

  const params = new URLSearchParams();
  params.set('type', interval);
  params.set('time_from', String(fromTs));
  params.set('time_to', String(toTs));
  params.set('dynamicPools', 'true');
  params.set('removeOutliers', 'true');
  params.set('fastCache', 'true');

  const url = `${API_BASE}/chart/${tokenMint}?${params.toString()}`;

  const response = await withRateLimit(() =>
    axios.get(url, {
      headers: { 'x-api-key': apiKey },
      timeout: 30000,
    })
  );

  const payload = response.data as any;
  if (Array.isArray(payload)) {
    return payload as OhlcvCandle[];
  }
  if (Array.isArray(payload?.oclhv)) {
    return payload.oclhv as OhlcvCandle[];
  }
  if (Array.isArray(payload?.data)) {
    return payload.data as OhlcvCandle[];
  }
  if (Array.isArray(payload?.candles)) {
    return payload.candles as OhlcvCandle[];
  }
  return [];
}

function alignToInterval(ts: number, intervalSeconds: number): number {
  return Math.floor(ts / intervalSeconds) * intervalSeconds;
}

export async function getCachedOhlcvForRange(
  tokenMint: string,
  interval: OhlcvInterval,
  fromTs: number,
  toTs: number,
  maxAgeMs: number = 5 * 60 * 1000
): Promise<OhlcvCandle[]> {
  const intervalSeconds = intervalToSeconds(interval);
  const alignedFrom = alignToInterval(fromTs, intervalSeconds);
  const alignedTo = alignToInterval(toTs, intervalSeconds);

  const hasRange = ohlcvQueries.hasCoveringRange.get(
    tokenMint,
    interval,
    alignedFrom,
    alignedTo,
    Date.now() - maxAgeMs
  ) as
    | { '1': number }
    | undefined;

  if (!hasRange) {
    const candles = await fetchOhlcvFromSolanaTracker(tokenMint, interval, alignedFrom, alignedTo);

    const insertTx = db.transaction(() => {
      for (const c of candles) {
        ohlcvQueries.insertCandle.run({
          token_mint: tokenMint,
          interval,
          timestamp: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        });
      }

      ohlcvQueries.insertFetchRange.run({
        token_mint: tokenMint,
        interval,
        from_ts: alignedFrom,
        to_ts: alignedTo,
        fetched_at: Date.now(),
        has_data: candles.length > 0 ? 1 : 0,
      });
    });

    insertTx();
  }

  const rows = ohlcvQueries.getCandlesInRange.all(tokenMint, interval, alignedFrom, alignedTo) as any[];
  return rows.map((r) => ({
    time: r.timestamp,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }));
}

export async function prefetchOhlcvForTokens(
  tokenMints: string[],
  interval: OhlcvInterval,
  fromTs: number,
  toTs: number,
  onProgress?: (current: number, total: number, mint?: string) => void,
  maxAgeMs: number = 5 * 60 * 1000
): Promise<{ fetched: number; cached: number; empty: number }> {
  let fetched = 0;
  let cached = 0;
  let empty = 0;
  const total = tokenMints.length;
  let current = 0;

  for (const mint of tokenMints) {
    current++;
    const intervalSeconds = intervalToSeconds(interval);
    const alignedFrom = alignToInterval(fromTs, intervalSeconds);
    const alignedTo = alignToInterval(toTs, intervalSeconds);

    const hasRange = ohlcvQueries.hasCoveringRange.get(
      mint,
      interval,
      alignedFrom,
      alignedTo,
      Date.now() - maxAgeMs
    ) as
      | { '1': number }
      | undefined;

    if (hasRange) {
      cached++;
      if (onProgress) onProgress(current, total, mint);
      continue;
    }

    const candles = await getCachedOhlcvForRange(mint, interval, fromTs, toTs);
    if (candles.length > 0) {
      fetched++;
    } else {
      empty++;
      if (empty <= 5) {
        console.warn(`OHLCV empty response for ${mint}`);
      }
    }
    if (onProgress) onProgress(current, total, mint);
  }

  return { fetched, cached, empty };
}
