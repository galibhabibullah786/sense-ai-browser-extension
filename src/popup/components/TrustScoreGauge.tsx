import { cn } from '@/lib/utils';
import { getScoreColor } from '@/lib/utils';

interface TrustScoreGaugeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
  animate?: boolean;
}

const sizeConfig = {
  sm: { width: 100, fontSize: 'text-xl', labelSize: 'text-[10px]' },
  md: { width: 140, fontSize: 'text-3xl', labelSize: 'text-xs' },
  lg: { width: 180, fontSize: 'text-4xl', labelSize: 'text-sm' },
};

export function TrustScoreGauge({
  score,
  size = 'md',
  label = 'Trust Score',
  className,
  animate = true,
}: TrustScoreGaugeProps) {
  const { color, label: statusLabel } = getScoreColor(score);
  const circumference = 2 * Math.PI * 45;
  const progress = (score / 100) * circumference;
  const config = sizeConfig[size];

  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      <div 
        className="relative" 
        style={{ width: config.width, height: config.width }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted/30"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={animate ? circumference - progress : circumference}
            className={animate ? 'transition-all duration-1000 ease-out' : ''}
            style={{
              strokeDashoffset: circumference - progress,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('font-bold tabular-nums', config.fontSize)}>
            {score}
          </span>
          <span
            className={cn('font-medium', config.labelSize)}
            style={{ color }}
          >
            {statusLabel}
          </span>
        </div>
      </div>
      {label && (
        <span className="text-muted-foreground text-xs font-medium">{label}</span>
      )}
    </div>
  );
}
