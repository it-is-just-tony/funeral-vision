import type { WalletProfile } from '../api';

interface Props {
  profile?: WalletProfile;
  isLoading: boolean;
}

function formatSeconds(seconds: number | undefined): string {
  if (seconds === undefined) return '–';
  if (seconds < 120) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 120) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 72) return `${Math.round(hours)}h`;
  const days = hours / 24;
  return `${Math.round(days * 10) / 10}d`;
}

export function WalletProfileCard({ profile, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg text-gray-400">
        Loading profile...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg text-gray-500">
        No profile available yet.
      </div>
    );
  }

  const dexEntries: Array<[string, number]> = profile?.dexBreakdown
    ? Object.entries(profile.dexBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 6)
    : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
        <div className="text-sm text-gray-400 mb-1">Activity</div>
        <div className="text-2xl font-semibold text-white">{profile.tokensTracked} tokens</div>
        <div className="text-sm text-gray-400">{profile.totalTrades} trades · {profile.totalSolVolume.toFixed(2)} SOL notional</div>
      </div>

      <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
        <div className="text-sm text-gray-400 mb-2">DEX mix (top)</div>
        <div className="flex flex-wrap gap-2">
          {dexEntries.map(([dex, count]) => (
            <span key={dex} className="px-3 py-1 rounded-full bg-gray-800 text-sm text-gray-200">
              {dex}: {count}
            </span>
          ))}
          {dexEntries.length === 0 && <span className="text-gray-500 text-sm">No DEX data</span>}
        </div>
      </div>

      <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
        <div className="text-sm text-gray-400 mb-1">Entry Latency</div>
        <div className="text-white text-lg">
          Typical: {formatSeconds(profile.entryLatencySeconds?.p50)}
        </div>
        <div className="text-sm text-gray-400">
          Slow end (90% of entries faster than this): {formatSeconds(profile.entryLatencySeconds?.p90)}
        </div>
        <div className="text-xs text-gray-500">Based on {profile.entryLatencySeconds?.sampleSize ?? 0} tokens</div>
      </div>

      <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
        <div className="text-sm text-gray-400 mb-1">Hold Durations</div>
        <div className="text-white text-lg">
          Typical: {formatSeconds(profile.holdDurationsSeconds?.median)}
        </div>
        <div className="text-sm text-gray-400">
          Long tail (90% of holds shorter than this): {formatSeconds(profile.holdDurationsSeconds?.p90)}
        </div>
        <div className="text-xs text-gray-500">Based on {profile.holdDurationsSeconds?.sampleSize ?? 0} tokens with buys & sells</div>
      </div>

      <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
        <div className="text-sm text-gray-400 mb-1">Behavior</div>
        <div className="text-white text-lg">
          Quick flips (sold within 10m): {profile.earlyExitRate !== undefined ? `${(profile.earlyExitRate * 100).toFixed(1)}%` : '–'}
        </div>
        <div className="text-sm text-gray-400">
          Exited tokens (bought then sold at least once): {profile.roundTripRate !== undefined ? `${(profile.roundTripRate * 100).toFixed(1)}%` : '–'}
        </div>
        <div className="text-xs text-gray-500">
          This is the share of tokens where you both bought and later sold, regardless of profit/loss.
        </div>
      </div>
    </div>
  );
}
