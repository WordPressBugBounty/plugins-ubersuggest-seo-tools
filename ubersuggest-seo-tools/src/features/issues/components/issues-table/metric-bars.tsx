import { cn, Text, type TranslationKeys } from '@ui';

// SEO impact / difficulty → a 3-bar indicator like the Ubersuggest dashboard.
// Impact: more bars = more value (green when high). Difficulty: more bars = harder
// (green when easy, red when hard). Unknown values render nothing.
// `key` is typed as a catalog key so callers can pass it straight to translate()
// without the runtime-key cast.
type Metric = { level: number; color: string; key: TranslationKeys };

export const IMPACT: Record<string, Metric> = {
  high: { level: 3, color: 'bg-emerald-500', key: 'lvl_high' },
  medium: { level: 2, color: 'bg-orange-400', key: 'lvl_medium' },
  low: { level: 1, color: 'bg-red-500', key: 'lvl_low' },
};
export const DIFFICULTY: Record<string, Metric> = {
  easy: { level: 1, color: 'bg-emerald-500', key: 'lvl_low' },
  moderate: { level: 2, color: 'bg-orange-400', key: 'lvl_medium' },
  hard: { level: 3, color: 'bg-red-500', key: 'lvl_high' },
};

export function MetricBars({
  level,
  color,
  label,
  title,
}: {
  level: number;
  color: string;
  label: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2" title={title}>
      <span className="flex items-center gap-0.5">
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={cn(
              'h-3 w-1 rounded-sm',
              bar <= level ? color : 'bg-zinc-200',
            )}
          />
        ))}
      </span>
      <Text size="sm" className="text-zinc-600">
        {label}
      </Text>
    </div>
  );
}
