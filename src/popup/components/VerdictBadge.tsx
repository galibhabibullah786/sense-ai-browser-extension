import { cn } from '@/lib/utils';
import { Shield, AlertTriangle, ShieldAlert, type LucideIcon } from 'lucide-react';
import type { Verdict } from '@/types';

interface VerdictBadgeProps {
  verdict: Verdict;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

interface VerdictConfig {
  label: string;
  icon: LucideIcon;
  className: string;
}

const verdictConfig: Record<Verdict, VerdictConfig> = {
  safe: {
    label: 'Safe',
    icon: Shield,
    className: 'bg-trust-safe/15 text-trust-safe border-trust-safe/30',
  },
  warning: {
    label: 'Warning',
    icon: AlertTriangle,
    className: 'bg-trust-warning/15 text-trust-warning border-trust-warning/30',
  },
  danger: {
    label: 'Danger',
    icon: ShieldAlert,
    className: 'bg-trust-danger/15 text-trust-danger border-trust-danger/30',
  },
};

const sizeClasses = {
  sm: 'text-[10px] px-2 py-0.5 gap-1',
  md: 'text-xs px-2.5 py-1 gap-1.5',
  lg: 'text-sm px-3 py-1.5 gap-2',
};

const iconSizes = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
  lg: 'h-4 w-4',
};

export function VerdictBadge({
  verdict,
  size = 'md',
  className,
}: VerdictBadgeProps) {
  const config = verdictConfig[verdict];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium border',
        sizeClasses[size],
        config.className,
        className
      )}
    >
      <Icon className={iconSizes[size]} />
      {config.label}
    </span>
  );
}
