import type { PnLSummary } from '@funeral-vision/shared';

interface PnLSummaryCardsProps {
  data?: PnLSummary;
  isLoading?: boolean;
}

function formatSOL(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return value.toFixed(4);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function StatCard({
  title,
  value,
  subValue,
  isPositive,
  isLoading,
}: {
  title: string;
  value: string;
  subValue?: string;
  isPositive?: boolean;
  isLoading?: boolean;
}) {
  return (
    <div className="card">
      <p className="text-gray-400 text-sm mb-1">{title}</p>
      {isLoading ? (
        <div className="h-8 bg-gray-700 rounded animate-pulse w-24" />
      ) : (
        <>
          <p
            className={`text-2xl font-bold ${
              isPositive === undefined
                ? 'text-white'
                : isPositive
                ? 'pnl-positive'
                : 'pnl-negative'
            }`}
          >
            {value}
          </p>
          {subValue && <p className="text-gray-500 text-sm mt-1">{subValue}</p>}
        </>
      )}
    </div>
  );
}

export function PnLSummaryCards({ data, isLoading }: PnLSummaryCardsProps) {
  const pnl = data?.totalRealizedPnL || 0;
  const isProfitable = pnl >= 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <StatCard
        title="Total PnL"
        value={`${isProfitable ? '+' : ''}${formatSOL(pnl)} SOL`}
        isPositive={isProfitable}
        isLoading={isLoading}
      />
      <StatCard
        title="Win Rate"
        value={formatPercent(data?.winRate || 0)}
        subValue={`${data?.winCount || 0}W / ${data?.lossCount || 0}L`}
        isPositive={data?.winRate ? data.winRate >= 50 : undefined}
        isLoading={isLoading}
      />
      <StatCard
        title="Total Trades"
        value={String(data?.totalTrades || 0)}
        subValue={`${data?.totalBuys || 0} buys / ${data?.totalSells || 0} sells`}
        isLoading={isLoading}
      />
      <StatCard
        title="Volume"
        value={`${formatSOL(data?.totalSolVolume || 0)} SOL`}
        subValue={`Avg: ${formatSOL(data?.avgTradeSize || 0)} SOL`}
        isLoading={isLoading}
      />
      <StatCard
        title="Avg Hold Time"
        value={formatDuration(data?.avgHoldDuration || 0)}
        isLoading={isLoading}
      />
      <StatCard
        title="Tokens Traded"
        value={String(data?.uniqueTokensTraded || 0)}
        isLoading={isLoading}
      />
    </div>
  );
}
