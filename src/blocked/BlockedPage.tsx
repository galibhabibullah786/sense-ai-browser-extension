import { useState, useEffect } from 'react';

type BlockReason = 'blocklist' | 'low-trust' | 'critical-verdict';

interface BlockInfo {
  url: string;
  reason: string;
  type: BlockReason;
  score?: number;
  verdict?: string;
}

export function BlockedPage() {
  const [info, setInfo] = useState<BlockInfo | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInfo({
      url: params.get('url') || 'Unknown URL',
      reason: params.get('reason') || 'This website has been blocked for your protection.',
      type: (params.get('type') as BlockReason) || 'blocklist',
      score: params.get('score') ? Number(params.get('score')) : undefined,
      verdict: params.get('verdict') || undefined,
    });

    // Check dark mode
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDark(prefersDark);

    // Also check extension settings
    chrome.storage?.local?.get('settings', (result: any) => {
      if (result?.settings?.darkMode === 'dark') setIsDark(true);
      else if (result?.settings?.darkMode === 'light') setIsDark(false);
    });
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const handleGoBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
    }
  };

  const handleProceedAnyway = () => {
    setCountdown(5);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0 && info?.url) {
      // Temporarily store a bypass flag so the navigation handler allows it
      chrome.storage?.session?.set({ bypassBlock: info.url }, () => {
        window.location.href = info.url;
      });
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, info]);

  if (!info) return null;

  const isBlocklist = info.type === 'blocklist';
  const isCritical = info.type === 'critical-verdict' || (info.score !== undefined && info.score < 15);

  return (
    <div style={{ textAlign: 'center' }}>
      {/* Shield icon */}
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: 'var(--danger-bg)', border: '3px solid var(--danger-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 24px', fontSize: 40,
      }}>
        🛡️
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: 'var(--danger)' }}>
        {isCritical ? 'Dangerous Website Blocked' : 'Website Blocked'}
      </h1>

      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24, maxWidth: 480, margin: '0 auto 24px' }}>
        SenseAI has blocked this website to protect your privacy and security.
      </p>

      {/* URL display */}
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px', marginBottom: 20,
        wordBreak: 'break-all', fontSize: 13, color: 'var(--muted)',
        fontFamily: 'monospace',
      }}>
        {info.url}
      </div>

      {/* Reason card */}
      <div style={{
        background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
        borderRadius: 12, padding: 20, marginBottom: 24, textAlign: 'left',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <strong style={{ fontSize: 14, color: 'var(--danger)' }}>Reason</strong>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.6 }}>
          {info.reason}
        </p>
      </div>

      {/* Trust Score (if available) */}
      {info.score !== undefined && (
        <div style={{
          background: 'var(--card-bg)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 20, marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            border: `4px solid var(--danger)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, color: 'var(--danger)',
          }}>
            {info.score}
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Trust Score</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {info.verdict && (
                <span style={{
                  display: 'inline-flex', padding: '2px 8px', borderRadius: 999,
                  fontSize: 11, fontWeight: 600, marginTop: 4,
                  background: 'var(--danger-bg)', color: 'var(--danger)',
                  border: '1px solid var(--danger-border)',
                }}>
                  {info.verdict.toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={handleGoBack}
          style={{
            padding: '12px 28px', borderRadius: 10,
            background: 'var(--primary)', color: 'white',
            border: 'none', fontWeight: 600, fontSize: 14,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          ← Go Back to Safety
        </button>

        {!isBlocklist && countdown === null && (
          <button
            onClick={handleProceedAnyway}
            style={{
              padding: '12px 28px', borderRadius: 10,
              background: 'transparent', color: 'var(--muted)',
              border: '1px solid var(--border)', fontWeight: 500, fontSize: 14,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Proceed Anyway (Not Recommended)
          </button>
        )}

        {countdown !== null && countdown > 0 && (
          <button
            disabled
            style={{
              padding: '12px 28px', borderRadius: 10,
              background: 'var(--danger-bg)', color: 'var(--danger)',
              border: '1px solid var(--danger-border)', fontWeight: 500, fontSize: 14,
              cursor: 'not-allowed', fontFamily: 'inherit', opacity: 0.8,
            }}
          >
            Redirecting in {countdown}s...
          </button>
        )}
      </div>

      {/* Info footer */}
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 32, opacity: 0.7 }}>
        Protected by SenseAI Trust Analysis • v1.0.0
      </p>
    </div>
  );
}
