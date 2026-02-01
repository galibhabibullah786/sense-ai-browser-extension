import { useState, useEffect, useCallback } from 'react';
import { 
  ExternalLink, 
  RefreshCw, 
  Shield, 
  AlertTriangle,
  Moon,
  Sun,
  Settings,
} from 'lucide-react';
import { 
  TrustScoreGauge, 
  VerdictBadge, 
  Button, 
  SignalBreakdown,
  StatusDisplay,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  ExplanationPanel,
} from './components';
import { cn, getDomainFromUrl, isAnalyzableUrl, truncate, formatRelativeTime } from '@/lib/utils';
import type { AnalysisResult, ExtensionStatus } from '@/types';

type ViewState = 'loading' | 'analyzing' | 'result' | 'error' | 'not-analyzable';

interface CurrentTab {
  id: number;
  url: string;
  domain: string;
}

export function App() {
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [currentTab, setCurrentTab] = useState<CurrentTab | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Initialize theme from system/storage
  useEffect(() => {
    const initTheme = async () => {
      try {
        const result = await chrome.storage.local.get('settings');
        const settings = result.settings;
        
        if (settings?.darkMode === 'dark') {
          setIsDarkMode(true);
        } else if (settings?.darkMode === 'light') {
          setIsDarkMode(false);
        } else {
          // Auto mode - check system preference
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          setIsDarkMode(prefersDark);
        }
      } catch {
        // Default to system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setIsDarkMode(prefersDark);
      }
    };

    initTheme();
  }, []);

  // Apply dark mode class
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // Get current tab info on mount
  useEffect(() => {
    const getCurrentTab = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab?.id || !tab.url) {
          setViewState('error');
          setError('Unable to get current tab information.');
          return;
        }

        if (!isAnalyzableUrl(tab.url)) {
          setViewState('not-analyzable');
          return;
        }

        const domain = getDomainFromUrl(tab.url);
        setCurrentTab({ id: tab.id, url: tab.url, domain });
        
        // Check for cached result
        const response = await chrome.runtime.sendMessage({
          type: 'GET_CACHED_RESULT',
          domain,
        });

        if (response?.result) {
          setResult(response.result);
          setFromCache(true);
          setViewState('result');
        } else {
          setViewState('loading');
        }
      } catch (err) {
        console.error('[SenseAI Popup] Error getting current tab:', err);
        setViewState('error');
        setError('Failed to initialize. Please try again.');
      }
    };

    getCurrentTab();
  }, []);

  // Get extension status
  useEffect(() => {
    const getStatus = async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
        if (response?.status) {
          setExtensionStatus(response.status);
        }
      } catch (err) {
        console.error('[SenseAI Popup] Error getting status:', err);
      }
    };

    getStatus();

    // Listen for status updates
    const listener = (message: { type: string; status?: ExtensionStatus; result?: AnalysisResult; fromCache?: boolean }) => {
      if (message.type === 'STATUS_UPDATE' && message.status) {
        setExtensionStatus(message.status);
      }
      if (message.type === 'ANALYSIS_RESULT' && message.result) {
        // Update result if it's for the current domain
        if (currentTab && message.result.domain === currentTab.domain) {
          setResult(message.result);
          setFromCache(message.fromCache || false);
        }
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [currentTab]);

  // Analyze current page
  const analyzePage = useCallback(async () => {
    if (!currentTab) return;

    setViewState('analyzing');
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_PAGE',
        tabId: currentTab.id,
        url: currentTab.url,
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      if (response?.result) {
        setResult(response.result);
        setFromCache(response.fromCache || false);
        setViewState('result');
      } else {
        throw new Error('No result received from analysis.');
      }
    } catch (err) {
      console.error('[SenseAI Popup] Analysis error:', err);
      setViewState('error');
      setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
    }
  }, [currentTab]);

  // Open dashboard
  const openDashboard = useCallback(async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
      window.close();
    } catch (err) {
      console.error('[SenseAI Popup] Error opening dashboard:', err);
    }
  }, []);

  // Toggle dark mode
  const toggleDarkMode = useCallback(async () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    
    try {
      const existing = await chrome.storage.local.get('settings');
      const settings = existing.settings || {};
      settings.darkMode = newMode ? 'dark' : 'light';
      await chrome.storage.local.set({ settings });
    } catch {
      // Ignore storage errors
    }
  }, [isDarkMode]);

  return (
    <div className="w-[360px] min-h-[400px] max-h-[560px] bg-background text-foreground flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Shield className="h-6 w-6 text-primary" />
            <div className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-primary rounded-full animate-pulse-ring" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">SenseAI</h1>
            <p className="text-[10px] text-muted-foreground">Trust Analysis</p>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <button
            onClick={toggleDarkMode}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
            aria-label="Toggle dark mode"
          >
            {isDarkMode ? (
              <Sun className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Moon className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <button
            onClick={openDashboard}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
            aria-label="Open dashboard"
          >
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Current Site Info */}
      {currentTab && viewState !== 'not-analyzable' && (
        <div className="px-4 py-2 bg-muted/30 border-b border-border">
          <p className="text-xs text-muted-foreground truncate">
            Analyzing: <span className="font-medium text-foreground">{currentTab.domain}</span>
          </p>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {viewState === 'not-analyzable' && (
          <div className="flex flex-col items-center justify-center h-full py-8 px-4 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="text-sm font-medium mb-1">Cannot Analyze This Page</h3>
            <p className="text-xs text-muted-foreground max-w-[240px]">
              Browser internal pages, extensions, and local files cannot be analyzed.
            </p>
          </div>
        )}

        {viewState === 'loading' && (
          <div className="flex flex-col items-center justify-center h-full py-8 px-4">
            <TrustScoreGauge score={0} size="md" label="" className="opacity-30 mb-4" />
            <p className="text-sm text-muted-foreground mb-4">Ready to analyze</p>
            <Button onClick={analyzePage} size="md">
              Analyze This Site
            </Button>
          </div>
        )}

        {viewState === 'analyzing' && (
          <StatusDisplay 
            type="loading" 
            title="Analyzing..."
            message="Collecting signals and evaluating website trust. This may take a few seconds."
          />
        )}

        {viewState === 'error' && (
          <div className="flex flex-col items-center py-8 px-4">
            <StatusDisplay 
              type="error" 
              message={error || undefined}
            />
            <Button onClick={analyzePage} variant="outline" size="sm" className="mt-4">
              <RefreshCw className="h-3.5 w-3.5" />
              Try Again
            </Button>
          </div>
        )}

        {viewState === 'result' && result && (
          <div className="p-4 space-y-4 animate-fade-in">
            {/* Trust Score Section */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col items-center">
                <TrustScoreGauge score={result.trustScore} size="md" label="" />
              </div>
              <div className="flex flex-col items-end gap-2">
                <VerdictBadge verdict={result.verdict} size="lg" />
                {fromCache && (
                  <span className="text-[10px] text-muted-foreground">
                    Cached • {formatRelativeTime(result.analyzedAt)}
                  </span>
                )}
                <Button 
                  onClick={analyzePage} 
                  variant="ghost" 
                  size="sm"
                  className="h-7 px-2 text-xs"
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh
                </Button>
              </div>
            </div>

            {/* Signal Breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Signal Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <SignalBreakdown scores={result.signalScores} compact />
              </CardContent>
            </Card>

            {/* AI Explanation */}
            <ExplanationPanel explanation={result.explanation} />

            {/* Quick Actions */}
            <div className="flex gap-2">
              <Button 
                onClick={openDashboard} 
                variant="outline" 
                size="sm" 
                className="flex-1"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View in Dashboard
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-4 py-2 border-t border-border bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div 
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                extensionStatus?.connectionStatus === 'connected' 
                  ? 'bg-trust-safe' 
                  : extensionStatus?.connectionStatus === 'connecting'
                  ? 'bg-trust-warning animate-pulse'
                  : 'bg-muted-foreground'
              )}
            />
            <span className="text-[10px] text-muted-foreground">
              {extensionStatus?.connectionStatus === 'connected' 
                ? 'Connected'
                : extensionStatus?.connectionStatus === 'connecting'
                ? 'Connecting...'
                : 'Simulation Mode'}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}
