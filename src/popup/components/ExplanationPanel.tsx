import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import { Sparkles, Loader2 } from 'lucide-react';
import type { ExplanationStatus } from '@/types';

interface ExplanationPanelProps {
  explanation?: ExplanationStatus;
  className?: string;
}

export function ExplanationPanel({ explanation, className }: ExplanationPanelProps) {
  if (!explanation) {
    return null;
  }

  return (
    <div className={cn('rounded-lg border border-border bg-card/50 p-3', className)}>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">AI Explanation</span>
        {explanation.status === 'generating' || explanation.status === 'pending' ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />
        ) : explanation.generatedAt ? (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {formatRelativeTime(explanation.generatedAt)}
          </span>
        ) : null}
      </div>

      {explanation.status === 'pending' || explanation.status === 'generating' ? (
        <div className="space-y-1.5">
          <div className="h-3 bg-muted rounded animate-pulse w-full" />
          <div className="h-3 bg-muted rounded animate-pulse w-5/6" />
          <div className="h-3 bg-muted rounded animate-pulse w-4/6" />
        </div>
      ) : explanation.status === 'complete' && explanation.text ? (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {explanation.text}
        </p>
      ) : explanation.status === 'failed' ? (
        <p className="text-xs text-destructive">
          {explanation.error || 'Failed to generate explanation. Please try again.'}
        </p>
      ) : null}
    </div>
  );
}
