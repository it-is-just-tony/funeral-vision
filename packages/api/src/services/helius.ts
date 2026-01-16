import axios, { AxiosInstance } from 'axios';
import { Connection, PublicKey, type ConfirmedSignatureInfo } from '@solana/web3.js';
import type { HeliusEnhancedTransaction } from '@solana-pnl/shared';

const HELIUS_API_BASE = 'https://api.helius.xyz';
const HELIUS_RPC_BASE = 'https://mainnet.helius-rpc.com';

export class HeliusService {
  private apiKey: string;
  private connection: Connection;
  private httpClient: AxiosInstance;
  private lastRequestTime = 0;
  private minRequestInterval = 100; // 100ms = 10 req/s for RPC

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    const rpcUrl = `${HELIUS_RPC_BASE}/?api-key=${apiKey}`;
    console.log(`Connecting to Helius RPC: ${HELIUS_RPC_BASE}/?api-key=${apiKey.slice(0, 8)}...`);
    this.connection = new Connection(rpcUrl);
    this.httpClient = axios.create({
      baseURL: HELIUS_API_BASE,
      timeout: 30000,
    });
  }

  /**
   * Rate limiter - ensures we don't exceed Helius free tier limits
   */
  private async rateLimit(minInterval: number = this.minRequestInterval): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Retry wrapper with exponential backoff
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 5,
    baseDelay = 2000
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        if (i === maxRetries - 1) throw error;
        
        // Check if it's a rate limit error (429)
        const is429 = error?.response?.status === 429;
        const delay = is429 
          ? baseDelay * Math.pow(2, i + 1)  // Longer delay for rate limits
          : baseDelay * Math.pow(2, i);
        
        console.warn(`Request failed (${is429 ? '429 rate limit' : 'error'}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * Fetch all transaction signatures for a wallet address
   * Uses pagination to get complete history
   */
  async getSignaturesForAddress(
    address: string,
    options: {
      limit?: number;
      before?: string;
      until?: string;
    } = {}
  ): Promise<ConfirmedSignatureInfo[]> {
    await this.rateLimit();

    const publicKey = new PublicKey(address);
    const signatures = await this.withRetry(() =>
      this.connection.getSignaturesForAddress(publicKey, {
        limit: options.limit || 1000,
        before: options.before,
        until: options.until,
      })
    );

    return signatures;
  }

  /**
   * Fetch ALL signatures for a wallet with automatic pagination
   * Warning: This can use many credits for active wallets
   */
  async getAllSignaturesForAddress(
    address: string,
    options: {
      until?: string; // Stop at this signature (for incremental sync)
      maxSignatures?: number; // Safety limit
      onProgress?: (count: number) => void;
    } = {}
  ): Promise<ConfirmedSignatureInfo[]> {
    const allSignatures: ConfirmedSignatureInfo[] = [];
    let lastSignature: string | undefined = undefined;
    const maxSignatures = options.maxSignatures || 10000;

    while (allSignatures.length < maxSignatures) {
      const batch = await this.getSignaturesForAddress(address, {
        limit: 1000,
        before: lastSignature,
        until: options.until,
      });

      if (batch.length === 0) break;

      // Check if we hit the 'until' signature
      const untilIndex = options.until
        ? batch.findIndex(s => s.signature === options.until)
        : -1;

      if (untilIndex >= 0) {
        allSignatures.push(...batch.slice(0, untilIndex));
        break;
      }

      allSignatures.push(...batch);
      lastSignature = batch[batch.length - 1].signature;

      if (options.onProgress) {
        options.onProgress(allSignatures.length);
      }

      // If we got less than 1000, we've reached the end
      if (batch.length < 1000) break;
    }

    return allSignatures;
  }

  /**
   * Parse transactions using Helius Enhanced Transactions API
   * Batches up to 100 signatures at once
   */
  async parseTransactions(signatures: string[]): Promise<HeliusEnhancedTransaction[]> {
    if (signatures.length === 0) return [];

    // Helius Enhanced API has lower rate limit (2 req/s), use 600ms to be safe
    await this.rateLimit(600);

    const response = await this.withRetry(() =>
      this.httpClient.post<HeliusEnhancedTransaction[]>(
        `/v0/transactions?api-key=${this.apiKey}`,
        { transactions: signatures.slice(0, 100) }
      )
    );

    return response.data;
  }

  /**
   * Parse all signatures in batches
   */
  async parseAllTransactions(
    signatures: string[],
    options: {
      onProgress?: (parsed: number, total: number) => void;
    } = {}
  ): Promise<HeliusEnhancedTransaction[]> {
    const allParsed: HeliusEnhancedTransaction[] = [];
    const batchSize = 100;

    for (let i = 0; i < signatures.length; i += batchSize) {
      const batch = signatures.slice(i, i + batchSize);
      const parsed = await this.parseTransactions(batch);
      allParsed.push(...parsed);

      if (options.onProgress) {
        options.onProgress(allParsed.length, signatures.length);
      }
    }

    return allParsed;
  }

  /**
   * Get parsed transaction directly using RPC
   * Fallback for when Enhanced API doesn't parse the transaction type
   */
  async getParsedTransaction(signature: string) {
    await this.rateLimit();

    return this.withRetry(() =>
      this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      })
    );
  }

  /**
   * Get connection for direct RPC calls
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get token metadata using Helius DAS API
   * DAS API uses the RPC endpoint, not the REST API
   */
  async getTokenMetadata(mints: string[]): Promise<TokenMetadata[]> {
    if (mints.length === 0) return [];

    // DAS API supports batching up to 1000 assets
    const results: TokenMetadata[] = [];
    const batchSize = 100;

    for (let i = 0; i < mints.length; i += batchSize) {
      const batch = mints.slice(i, i + batchSize);
      await this.rateLimit(300); // DAS has decent rate limits

      try {
        // DAS API uses the RPC endpoint (mainnet.helius-rpc.com), not api.helius.xyz
        const response = await this.withRetry(() =>
          this.httpClient.post(`${HELIUS_RPC_BASE}/?api-key=${this.apiKey}`, {
            jsonrpc: '2.0',
            id: 'token-metadata',
            method: 'getAssetBatch',
            params: { ids: batch },
          })
        );

        const assets = response.data?.result || [];
        for (const asset of assets) {
          if (asset && asset.id) {
            results.push({
              mint: asset.id,
              symbol: asset.content?.metadata?.symbol || null,
              name: asset.content?.metadata?.name || null,
              image: asset.content?.links?.image || asset.content?.files?.[0]?.uri || null,
              decimals: asset.token_info?.decimals ?? null,
            });
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch metadata for batch starting at ${i}:`, error);
        // Add nulls for failed batch
        for (const mint of batch) {
          results.push({ mint, symbol: null, name: null, image: null, decimals: null });
        }
      }
    }

    return results;
  }
}

export interface TokenMetadata {
  mint: string;
  symbol: string | null;
  name: string | null;
  image: string | null;
  decimals: number | null;
}

// Singleton instance
let heliusService: HeliusService | null = null;

export function getHeliusService(): HeliusService {
  if (!heliusService) {
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
      throw new Error('HELIUS_API_KEY environment variable is required');
    }
    heliusService = new HeliusService(apiKey);
  }
  return heliusService;
}
