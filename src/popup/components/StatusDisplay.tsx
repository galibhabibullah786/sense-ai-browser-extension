import { cn } from '@/lib/utils';
import { Loader2, WifiOff, AlertCircle } from 'lucide-react';

type StatusType = 'loading' | 'error' | 'offline' | 'empty';

interface StatusDisplayProps {
  type: StatusType;
  title?: string;
  message?: string;
  className?: string;
}

const statusConfig: Record<StatusType, { icon: typeof Loader2; defaultTitle: string; defaultMessage: string }> = {
  loading: {
    icon: Loader2,
    defaultTitle: 'Analyzing...',
    defaultMessage: 'Collecting signals and analyzing website trust.',
  },
  error: {
    icon: AlertCircle,
    defaultTitle: 'Analysis Failed',
    defaultMessage: 'Unable to analyze this page. Please try again.',
  },
  offline: {
    icon: WifiOff,
    defaultTitle: 'Offline Mode',
    defaultMessage: 'Backend not available. Using cached results.',
  },
  empty: {
    icon: AlertCircle,
    defaultTitle: 'No Data',
    defaultMessage: 'Click "Analyze" to check this website.',
  },
};

export function StatusDisplay({
  type,
  title,
  message,
  className,
}: StatusDisplayProps) {
  const config = statusConfig[type];
  const Icon = config.icon;

  return (
    <div className={cn('flex flex-col items-center justify-center py-8 px-4 text-center', className)}>
      <Icon
        className={cn(
          'h-10 w-10 mb-3',
          type === 'loading' ? 'animate-spin text-primary' : 'text-muted-foreground'
        )}
      />
      <h3 className="text-sm font-medium text-foreground mb-1">
        {title || config.defaultTitle}
      </h3>
      <p className="text-xs text-muted-foreground max-w-[200px]">
        {message || config.defaultMessage}
      </p>
    </div>
  );
}
