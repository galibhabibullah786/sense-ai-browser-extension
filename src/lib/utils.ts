import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Extract domain from URL
 */
export function getDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

/**
 * Format date to relative time string
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

/**
 * Get verdict from trust score
 */
export function getVerdictFromScore(score: number): 'safe' | 'warning' | 'danger' {
  if (score >= 70) return 'safe';
  if (score >= 40) return 'warning';
  return 'danger';
}

/**
 * Get color for trust score
 */
export function getScoreColor(score: number): { color: string; label: string } {
  if (score >= 70) return { color: 'hsl(152, 76%, 40%)', label: 'Safe' };
  if (score >= 40) return { color: 'hsl(38, 92%, 50%)', label: 'Caution' };
  return { color: 'hsl(0, 84%, 60%)', label: 'Risk' };
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Check if URL is analyzable (not internal pages)
 */
export function isAnalyzableUrl(url: string): boolean {
  if (!url) return false;
  
  const nonAnalyzableProtocols = [
    'chrome://',
    'chrome-extension://',
    'moz-extension://',
    'edge://',
    'about:',
    'file://',
    'data:',
    'javascript:',
  ];
  
  return !nonAnalyzableProtocols.some(protocol => url.startsWith(protocol));
}
