import { cn } from '@/lib/utils';
import type { SignalScores } from '@/types';
import { 
  Cookie, 
  Eye, 
  Fingerprint, 
  ShieldCheck, 
  Lock,
  type LucideIcon 
} from 'lucide-react';

interface SignalBreakdownProps {
  scores: SignalScores;
  compact?: boolean;
  className?: string;
}

interface SignalItem {
  key: keyof SignalScores;
  label: string;
  icon: LucideIcon;
}

const signalItems: SignalItem[] = [
  { key: 'ssl', label: 'SSL/TLS', icon: Lock },
  { key: 'headers', label: 'Headers', icon: ShieldCheck },
  { key: 'cookies', label: 'Cookies', icon: Cookie },
  { key: 'trackers', label: 'Trackers', icon: Eye },
  { key: 'fingerprinting', label: 'Fingerprint', icon: Fingerprint },
];

function getScoreColorClass(score: number): string {
  if (score >= 70) return 'bg-trust-safe';
  if (score >= 40) return 'bg-trust-warning';
  return 'bg-trust-danger';
}

function getScoreTextClass(score: number): string {
  if (score >= 70) return 'text-trust-safe';
  if (score >= 40) return 'text-trust-warning';
  return 'text-trust-danger';
}

export function SignalBreakdown({
  scores,
  compact = false,
  className,
}: SignalBreakdownProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {signalItems.map(({ key, label, icon: Icon }) => {
        const score = scores[key];
        return (
          <div key={key} className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className={cn(
              'text-muted-foreground flex-shrink-0',
              compact ? 'text-[10px] w-16' : 'text-xs w-20'
            )}>
              {label}
            </span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-500', getScoreColorClass(score))}
                style={{ width: `${score}%` }}
              />
            </div>
            <span className={cn(
              'font-medium tabular-nums flex-shrink-0',
              compact ? 'text-[10px] w-6' : 'text-xs w-8',
              getScoreTextClass(score)
            )}>
              {score}
            </span>
          </div>
        );
      })}
    </div>
  );
}
