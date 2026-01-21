import { useState, useEffect, useCallback } from 'react';
import type { Position } from '@funeral-vision/shared';
import { getTokenMetadata, type TokenMetadata } from '../api';

type CopiedState = Record<string, boolean>;

interface PositionsTableProps {
  positions: Position[];
  isLoading?: boolean;
}

function formatSOL(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return value.toFixed(4);
}

function truncateAddress(address: string, chars = 6): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function PositionsTable({ positions, isLoading }: PositionsTableProps) {
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, TokenMetadata>>({});
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [copied, setCopied] = useState<CopiedState>({});

  const copyToClipboard = useCallback((mint: string) => {
    navigator.clipboard.writeText(mint);
    setCopied(prev => ({ ...prev, [mint]: true }));
    setTimeout(() => {
      setCopied(prev => ({ ...prev, [mint]: false }));
    }, 1500);
  }, []);

  // Fetch token metadata when positions change
  useEffect(() => {
    if (positions.length === 0) return;

    const mints = positions.map(p => p.tokenMint);
    
    // Only fetch mints we don't already have
    const missingMints = mints.filter(m => !tokenMetadata[m]);
    if (missingMints.length === 0) return;

    setMetadataLoading(true);
    getTokenMetadata(missingMints)
      .then(metadata => {
        setTokenMetadata(prev => ({ ...prev, ...metadata }));
      })
      .catch(err => {
        console.error('Failed to fetch token metadata:', err);
      })
      .finally(() => {
        setMetadataLoading(false);
      });
  }, [positions]);

  if (isLoading) {
    return (
      <div className="card">
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (!positions.length) {
    return (
      <div className="card text-center py-8 text-theme-text-secondary">
        No positions found
      </div>
    );
  }

  // Sort by realized PnL
  const sortedPositions = [...positions].sort((a, b) => b.realizedPnL - a.realizedPnL);

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="table-header">
            <tr>
              <th className="text-left p-4">Token</th>
              <th className="text-right p-4">Realized PnL</th>
              <th className="text-right p-4">Total Bought</th>
              <th className="text-right p-4">Total Sold</th>
              <th className="text-right p-4">Remaining</th>
              <th className="text-right p-4">Cost Basis</th>
              <th className="text-right p-4">Proceeds</th>
              <th className="text-center p-4">Trades</th>
              <th className="text-center p-4">
                Win Rate
                <span
                  className="ml-1 text-theme-text-muted cursor-help"
                  title="Profitable sells divided by total trades for this token (buys + sells)."
                >
                  ⓘ
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedPositions.map((pos) => {
              const isProfitable = pos.realizedPnL >= 0;
              const winRate =
                pos.tradeCount > 0
                  ? ((pos.winCount / pos.tradeCount) * 100).toFixed(0)
                  : '0';
              const meta = tokenMetadata[pos.tokenMint];
              const displayName = meta?.symbol || meta?.name || pos.tokenSymbol || truncateAddress(pos.tokenMint, 6);

              return (
                <tr key={pos.tokenMint} className="table-row">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {meta?.image && (
                        <img
                          src={meta.image}
                          alt={displayName}
                          className="w-6 h-6 rounded-full"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                      <div className="flex flex-col">
                        <a
                          href={`https://solscan.io/token/${pos.tokenMint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-solana-purple hover:text-solana-green font-medium text-sm"
                        >
                          {displayName}
                        </a>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(pos.tokenMint)}
                          className="text-xs text-theme-text-muted hover:text-theme-text-secondary text-left cursor-pointer transition-colors"
                          title="Click to copy token address"
                        >
                          {copied[pos.tokenMint] ? 'Copied!' : truncateAddress(pos.tokenMint, 4)}
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <span
                      className={`font-medium ${isProfitable ? 'pnl-positive' : 'pnl-negative'}`}
                    >
                      {isProfitable ? '+' : ''}
                      {formatSOL(pos.realizedPnL)} SOL
                    </span>
                  </td>
                  <td className="p-4 text-right text-sm text-theme-text-secondary">
                    {pos.totalBought.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-right text-sm text-theme-text-secondary">
                    {pos.totalSold.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-right text-sm text-theme-text-secondary">
                    {pos.remainingTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-right text-sm text-theme-text-muted">
                    {formatSOL(pos.totalCostBasis)} SOL
                  </td>
                  <td className="p-4 text-right text-sm text-theme-text-muted">
                    {formatSOL(pos.totalProceeds)} SOL
                  </td>
                  <td className="p-4 text-center text-sm text-theme-text-secondary">{pos.tradeCount}</td>
                  <td className="p-4 text-center">
                    <span
                      className={`text-sm ${Number(winRate) >= 50 ? 'pnl-positive' : 'pnl-negative'}`}
                    >
                      {winRate}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="p-4 border-t divider bg-theme-bg-hover/30">
        <div className="flex justify-between items-center">
          <span className="text-theme-text-secondary">
            Total Realized PnL:
            {metadataLoading && <span className="ml-2 text-xs text-theme-text-muted">(loading token names...)</span>}
          </span>
          <span
            className={`text-lg font-bold ${
              positions.reduce((sum, p) => sum + p.realizedPnL, 0) >= 0
                ? 'pnl-positive'
                : 'pnl-negative'
            }`}
          >
            {formatSOL(positions.reduce((sum, p) => sum + p.realizedPnL, 0))} SOL
          </span>
        </div>
      </div>
    </div>
  );
}
