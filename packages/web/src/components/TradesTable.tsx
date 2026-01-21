import { useState } from 'react';
import type { Timeframe } from '@funeral-vision/shared';
import { useTrades } from '../hooks/useTrades';

interface TradesTableProps {
  walletAddress: string;
  timeframe: Timeframe;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

function formatSOL(value: number): string {
  return value.toFixed(4);
}

function truncateAddress(address: string, chars = 6): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function TradesTable({ walletAddress, timeframe }: TradesTableProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useTrades(walletAddress, timeframe, page);

  if (error) {
    return (
      <div className="card text-center py-8 text-theme-text-secondary">
        Failed to load trades: {error.message}
      </div>
    );
  }

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

  if (!data?.trades.length) {
    return (
      <div className="card text-center py-8 text-theme-text-secondary">
        No trades found for this timeframe
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="table-header">
            <tr>
              <th className="text-left p-4">Time</th>
              <th className="text-left p-4">Type</th>
              <th className="text-left p-4">Token</th>
              <th className="text-right p-4">Amount</th>
              <th className="text-right p-4">SOL</th>
              <th className="text-right p-4">Price</th>
              <th className="text-left p-4">DEX</th>
              <th className="text-left p-4">Tx</th>
            </tr>
          </thead>
          <tbody>
            {data.trades.map((trade) => (
              <tr key={trade.id} className="table-row">
                <td className="p-4 text-sm text-theme-text-secondary">
                  {formatDate(trade.timestamp)}
                </td>
                <td className="p-4">
                  <span
                    className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                      trade.type === 'buy'
                        ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                        : 'bg-red-500/20 text-red-600 dark:text-red-400'
                    }`}
                  >
                    {trade.type.toUpperCase()}
                  </span>
                </td>
                <td className="p-4">
                  <span className="text-sm font-mono text-theme-text-secondary">
                    {trade.tokenSymbol || truncateAddress(trade.tokenMint, 4)}
                  </span>
                </td>
                <td className="p-4 text-right text-sm text-theme-text-secondary">
                  {trade.tokenAmount.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="p-4 text-right text-sm">
                  <span className={trade.type === 'buy' ? 'pnl-negative' : 'pnl-positive'}>
                    {trade.type === 'buy' ? '-' : '+'}
                    {formatSOL(trade.solAmount)}
                  </span>
                </td>
                <td className="p-4 text-right text-sm text-theme-text-secondary">
                  {formatSOL(trade.pricePerToken)}
                </td>
                <td className="p-4 text-sm text-theme-text-muted">{trade.dex || '-'}</td>
                <td className="p-4">
                  <a
                    href={`https://solscan.io/tx/${trade.signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-solana-purple hover:text-solana-green text-sm"
                  >
                    {truncateAddress(trade.signature, 4)}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-between p-4 border-t divider">
          <p className="text-sm text-theme-text-secondary">
            Showing {(page - 1) * data.pageSize + 1} to{' '}
            {Math.min(page * data.pageSize, data.total)} of {data.total} trades
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary px-3 py-1 text-sm"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm text-theme-text-secondary">
              Page {page} of {data.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="btn-secondary px-3 py-1 text-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
