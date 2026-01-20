import { useState, useMemo } from 'react';
import type { WalletRanking } from '../api';

interface Props {
  wallets: WalletRanking[];
  isLoading: boolean;
  onSelect?: (address: string) => void;
  onCalculateScores?: () => Promise<void>;
  isCalculating?: boolean;
}

type SortColumn = 'simulatedPnL' | 'realizedPnL' | 'followabilityRatio' | 'winRate' | 'avgTimeToFirstSellSec' | 'quickDumpRate';
type SortDirection = 'asc' | 'desc';

const FOLLOW_SCORE_EXPLAINER = `Follow Score measures how profitable it would be to copy this wallet's trades.

How it works:
• Simulates entering each trade 5 seconds after the wallet
• Applies realistic slippage based on trade size
• Penalizes quick exits (< 2 min) that can't be followed

Score interpretation:
• 0.8-1.0 = Excellent (you'd capture most of their profits)
• 0.5-0.8 = Good (followable with some loss)
• 0.2-0.5 = Risky (significant slippage/timing loss)
• < 0.2 = Unfollowable (likely farming copytrades)

Quick Dump Rate shows % of tokens sold within 60s of buying.
High quick dump + low follow score = likely copytrade farmer.`;

function getFollowScoreColor(ratio: number | undefined): string {
  if (ratio === undefined) return 'text-gray-500';
  if (ratio >= 0.8) return 'text-green-400';
  if (ratio >= 0.5) return 'text-yellow-400';
  if (ratio >= 0.2) return 'text-orange-400';
  return 'text-red-400';
}

function getFollowScoreLabel(ratio: number | undefined): string {
  if (ratio === undefined) return 'N/A';
  if (ratio >= 0.8) return 'Excellent';
  if (ratio >= 0.5) return 'Good';
  if (ratio >= 0.2) return 'Risky';
  return 'Unfollowable';
}

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) return 'N/A';
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function ProfitableWallets({ wallets, isLoading, onSelect, onCalculateScores, isCalculating }: Props) {
  const [showExplainer, setShowExplainer] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>('simulatedPnL');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Check if any wallet has follow scores
  const hasFollowScores = wallets.some(w => w.followabilityRatio !== undefined);

  // Sort wallets
  const sortedWallets = useMemo(() => {
    return [...wallets].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      // Handle undefined values - push them to the end
      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;

      const comparison = aVal - bVal;
      return sortDirection === 'desc' ? -comparison : comparison;
    });
  }, [wallets, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const SortIndicator = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <span className="text-gray-600 ml-1">↕</span>;
    return <span className="text-blue-400 ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Follow Simulation</h2>
          <p className="text-sm text-gray-400 mt-1">
            Simulate following wallets with realistic delays and slippage.{' '}
            <button
              type="button"
              onClick={() => setShowExplainer(!showExplainer)}
              className="text-blue-400 hover:text-blue-300 underline"
            >
              How is this calculated?
            </button>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isLoading && <span className="text-sm text-gray-400">Loading...</span>}
          {onCalculateScores && (
            <button
              type="button"
              onClick={onCalculateScores}
              disabled={isCalculating}
              className="btn-primary"
            >
              {isCalculating ? 'Calculating...' : hasFollowScores ? 'Recalculate Scores' : 'Calculate Scores'}
            </button>
          )}
        </div>
      </div>

      {showExplainer && (
        <div className="p-3 bg-gray-800/80 rounded-lg text-sm text-gray-300 whitespace-pre-line border border-gray-700">
          {FOLLOW_SCORE_EXPLAINER}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left p-4 text-gray-400 font-medium">Wallet</th>
              <th className="text-right p-4 text-gray-400 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort('simulatedPnL')}
                  className="cursor-pointer hover:text-white flex items-center justify-end w-full"
                  title="Simulated PnL if you followed this wallet (with delay + slippage)"
                >
                  Sim. PnL
                  <SortIndicator column="simulatedPnL" />
                </button>
              </th>
              <th className="text-right p-4 text-gray-400 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort('realizedPnL')}
                  className="cursor-pointer hover:text-white flex items-center justify-end w-full"
                  title="Actual PnL the wallet achieved"
                >
                  Actual PnL
                  <SortIndicator column="realizedPnL" />
                </button>
              </th>
              <th className="text-right p-4 text-gray-400 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort('followabilityRatio')}
                  className="cursor-pointer hover:text-white flex items-center justify-end w-full"
                  title="Follow Score = Simulated PnL / Actual PnL. Higher is better."
                >
                  Follow Score
                  <SortIndicator column="followabilityRatio" />
                </button>
              </th>
              <th className="text-right p-4 text-gray-400 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort('winRate')}
                  className="cursor-pointer hover:text-white flex items-center justify-end w-full"
                >
                  Win Rate
                  <SortIndicator column="winRate" />
                </button>
              </th>
              <th className="text-right p-4 text-gray-400 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort('avgTimeToFirstSellSec')}
                  className="cursor-pointer hover:text-white flex items-center justify-end w-full"
                  title="Average time from first buy to first sell"
                >
                  Avg Exit
                  <SortIndicator column="avgTimeToFirstSellSec" />
                </button>
              </th>
              <th className="text-right p-4 text-gray-400 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort('quickDumpRate')}
                  className="cursor-pointer hover:text-white flex items-center justify-end w-full"
                  title="% of tokens where first sell was within 60 seconds of first buy. High % = likely farming copytrades."
                >
                  Quick Dump
                  <SortIndicator column="quickDumpRate" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {sortedWallets.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">
                  No wallets with trade data yet. Import wallets and sync their data first.
                </td>
              </tr>
            )}
            {sortedWallets.map((w) => {
              const isLikelyFarmer = (w.quickDumpRate !== undefined && w.quickDumpRate > 0.3) ||
                (w.followabilityRatio !== undefined && w.followabilityRatio < 0.2);

              return (
                <tr
                  key={w.address}
                  className={`hover:bg-gray-800/30 transition-colors cursor-pointer ${isLikelyFarmer ? 'opacity-60' : ''}`}
                  onClick={() => onSelect?.(w.address)}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{w.emoji || '👛'}</span>
                      <div>
                        <div className="font-medium text-white flex items-center gap-2">
                          {w.name || w.address.slice(0, 8)}…
                          {isLikelyFarmer && (
                            <span className="text-xs px-1.5 py-0.5 bg-red-900/50 text-red-400 rounded" title="Likely farming copytrades">
                              ⚠️
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">{w.address.slice(0, 4)}...{w.address.slice(-4)}</div>
                      </div>
                    </div>
                  </td>
                  <td className={`p-4 text-right font-medium ${(w.simulatedPnL ?? 0) >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                    {w.simulatedPnL !== undefined ? `${w.simulatedPnL >= 0 ? '+' : ''}${w.simulatedPnL.toFixed(2)}` : '—'}
                  </td>
                  <td className="p-4 text-right text-gray-300">
                    {w.realizedPnL >= 0 ? '+' : ''}{w.realizedPnL.toFixed(2)}
                  </td>
                  <td className={`p-4 text-right font-medium ${getFollowScoreColor(w.followabilityRatio)}`}>
                    {w.followabilityRatio !== undefined ? (
                      <span title={getFollowScoreLabel(w.followabilityRatio)}>
                        {(w.followabilityRatio * 100).toFixed(0)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className={`p-4 text-right ${w.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                    {w.winRate.toFixed(1)}%
                  </td>
                  <td className="p-4 text-right text-gray-300">
                    {formatDuration(w.avgTimeToFirstSellSec)}
                  </td>
                  <td className={`p-4 text-right ${(w.quickDumpRate ?? 0) > 0.3 ? 'text-red-400' : 'text-gray-300'}`}>
                    {w.quickDumpRate !== undefined ? `${(w.quickDumpRate * 100).toFixed(0)}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
