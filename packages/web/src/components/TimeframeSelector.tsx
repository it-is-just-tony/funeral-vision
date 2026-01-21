import type { Timeframe } from '@funeral-vision/shared';

interface TimeframeSelectorProps {
  value: Timeframe;
  onChange: (timeframe: Timeframe) => void;
}

const timeframes: { value: Timeframe; label: string }[] = [
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'all', label: 'All Time' },
];

export function TimeframeSelector({ value, onChange }: TimeframeSelectorProps) {
  return (
    <div className="flex gap-2 bg-theme-bg-hover p-1 rounded-lg">
      {timeframes.map((tf) => (
        <button
          key={tf.value}
          onClick={() => onChange(tf.value)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            value === tf.value
              ? 'bg-solana-purple text-white'
              : 'text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary'
          }`}
        >
          {tf.label}
        </button>
      ))}
    </div>
  );
}
