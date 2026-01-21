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
      <div className="card text-theme-text-secondary">
        Loading profile...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="card text-theme-text-muted">
        No profile available yet.
      </div>
    );
  }

  const dexEntries: Array<[string, number]> = profile?.dexBreakdown
    ? Object.entries(profile.dexBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 6)
    : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="card">
        <div className="text-sm text-theme-text-secondary mb-1">Activity</div>
        <div className="text-2xl font-semibold">{profile.tokensTracked} tokens</div>
        <div className="text-sm text-theme-text-secondary">{profile.totalTrades} trades · {profile.totalSolVolume.toFixed(2)} SOL notional</div>
      </div>

      <div className="card">
        <div className="text-sm text-theme-text-secondary mb-2">DEX mix (top)</div>
        <div className="flex flex-wrap gap-2">
          {dexEntries.map(([dex, count]) => (
            <span key={dex} className="px-3 py-1 rounded-full bg-theme-bg-hover text-sm">
              {dex}: {count}
            </span>
          ))}
          {dexEntries.length === 0 && <span className="text-theme-text-muted text-sm">No DEX data</span>}
        </div>
      </div>

      <div className="card">
        <div className="text-sm text-theme-text-secondary mb-1">Entry Latency</div>
        <div className="text-lg">
          Typical: {formatSeconds(profile.entryLatencySeconds?.p50)}
        </div>
        <div className="text-sm text-theme-text-secondary">
          Slow end (90% of entries faster than this): {formatSeconds(profile.entryLatencySeconds?.p90)}
        </div>
        <div className="text-xs text-theme-text-muted">Based on {profile.entryLatencySeconds?.sampleSize ?? 0} tokens</div>
      </div>

      <div className="card">
        <div className="text-sm text-theme-text-secondary mb-1">Hold Durations</div>
        <div className="text-lg">
          Typical: {formatSeconds(profile.holdDurationsSeconds?.median)}
        </div>
        <div className="text-sm text-theme-text-secondary">
          Long tail (90% of holds shorter than this): {formatSeconds(profile.holdDurationsSeconds?.p90)}
        </div>
        <div className="text-xs text-theme-text-muted">Based on {profile.holdDurationsSeconds?.sampleSize ?? 0} tokens with buys & sells</div>
      </div>

      <div className="card">
        <div className="text-sm text-theme-text-secondary mb-1">Behavior</div>
        <div className="text-lg">
          Quick flips (sold within 10m): {profile.earlyExitRate !== undefined ? `${(profile.earlyExitRate * 100).toFixed(1)}%` : '–'}
        </div>
        <div className="text-sm text-theme-text-secondary">
          Exited tokens (bought then sold at least once): {profile.roundTripRate !== undefined ? `${(profile.roundTripRate * 100).toFixed(1)}%` : '–'}
        </div>
        <div className="text-xs text-theme-text-muted">
          This is the share of tokens where you both bought and later sold, regardless of profit/loss.
        </div>
      </div>
    </div>
  );
}
