// ============================================================================
// Shared Types for SenseAI Extension
// These types should match the backend API and web app data structures
// ============================================================================

// ============================================================================
// Signal Types - Data collected from web pages
// ============================================================================

export interface CookieInfo {
  name: string;
  domain: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  expirationDate?: number;
}

export interface CookieSignal {
  count: number;
  thirdPartyCount: number;
  cookies: CookieInfo[];
}

export interface TrackerSignal {
  detected: string[];
  blocked: number;
  scripts: string[];
}

export interface FingerprintSignal {
  techniques: string[];
  risk: 'low' | 'medium' | 'high';
}

export interface HeaderSignal {
  present: string[];
  missing: string[];
  issues: string[];
}

export interface SSLSignal {
  valid: boolean;
  issuer?: string;
  expiresAt?: string;
  protocol?: string;
}

export interface PageSignals {
  url: string;
  domain: string;
  timestamp: string;
  cookies: CookieSignal;
  trackers: TrackerSignal;
  fingerprinting: FingerprintSignal;
  headers: HeaderSignal;
  ssl: SSLSignal;
}

// ============================================================================
// Analysis Result Types
// ============================================================================

export type Verdict = 'safe' | 'warning' | 'danger';

export interface SignalScores {
  cookies: number;
  trackers: number;
  fingerprinting: number;
  headers: number;
  ssl: number;
}

export interface AnalysisResult {
  id: string;
  url: string;
  domain: string;
  trustScore: number;
  verdict: Verdict;
  signalScores: SignalScores;
  signals: PageSignals;
  analyzedAt: string;
  explanation?: ExplanationStatus;
}

export interface ExplanationStatus {
  status: 'pending' | 'generating' | 'complete' | 'failed';
  text?: string;
  generatedAt?: string;
  error?: string;
}

// ============================================================================
// Message Types - Communication between extension components
// ============================================================================

export type MessageType =
  | 'COLLECT_SIGNALS'
  | 'SIGNALS_COLLECTED'
  | 'ANALYZE_PAGE'
  | 'ANALYSIS_RESULT'
  | 'GET_CACHED_RESULT'
  | 'CACHED_RESULT'
  | 'CLEAR_CACHE'
  | 'GET_STATUS'
  | 'STATUS_UPDATE'
  | 'AUTH_TOKEN_SET'
  | 'AUTH_TOKEN_CLEARED'
  | 'OPEN_DASHBOARD';

export interface BaseMessage {
  type: MessageType;
  tabId?: number;
}

export interface CollectSignalsMessage extends BaseMessage {
  type: 'COLLECT_SIGNALS';
  tabId: number;
}

export interface SignalsCollectedMessage extends BaseMessage {
  type: 'SIGNALS_COLLECTED';
  signals: PageSignals;
}

export interface AnalyzePageMessage extends BaseMessage {
  type: 'ANALYZE_PAGE';
  tabId: number;
  url: string;
}

export interface AnalysisResultMessage extends BaseMessage {
  type: 'ANALYSIS_RESULT';
  result: AnalysisResult;
  fromCache?: boolean;
}

export interface GetCachedResultMessage extends BaseMessage {
  type: 'GET_CACHED_RESULT';
  domain: string;
}

export interface CachedResultMessage extends BaseMessage {
  type: 'CACHED_RESULT';
  result: AnalysisResult | null;
}

export interface StatusUpdateMessage extends BaseMessage {
  type: 'STATUS_UPDATE';
  status: ExtensionStatus;
}

export type ExtensionMessage =
  | CollectSignalsMessage
  | SignalsCollectedMessage
  | AnalyzePageMessage
  | AnalysisResultMessage
  | GetCachedResultMessage
  | CachedResultMessage
  | StatusUpdateMessage
  | { type: 'GET_STATUS' }
  | { type: 'CLEAR_CACHE' }
  | { type: 'OPEN_DASHBOARD' }
  | { type: 'AUTH_TOKEN_SET'; token: string }
  | { type: 'AUTH_TOKEN_CLEARED' };

// ============================================================================
// Extension State Types
// ============================================================================

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'offline';

export interface ExtensionStatus {
  isAuthenticated: boolean;
  connectionStatus: ConnectionStatus;
  pendingAnalyses: number;
  offlineQueueSize: number;
}

export interface CachedAnalysis {
  result: AnalysisResult;
  cachedAt: string;
  expiresAt: string;
}

export interface OfflineQueueItem {
  id: string;
  signals: PageSignals;
  queuedAt: string;
  retryCount: number;
}

// ============================================================================
// Storage Schema
// ============================================================================

export interface StorageSchema {
  // Session storage (cleared on browser restart)
  session: {
    accessToken?: string;
    currentTabResults: Record<number, AnalysisResult>;
  };
  // Local storage (persisted)
  local: {
    cachedResults: Record<string, CachedAnalysis>;
    offlineQueue: OfflineQueueItem[];
    settings: ExtensionSettings;
    linkedAt?: string;
  };
}

export interface ExtensionSettings {
  autoAnalyze: boolean;
  showNotifications: boolean;
  cacheExpiration: number; // hours
  darkMode: 'auto' | 'light' | 'dark';
  dashboardUrl: string;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  autoAnalyze: false,
  showNotifications: true,
  cacheExpiration: 24,
  darkMode: 'auto',
  dashboardUrl: 'http://localhost:5173', // Web app URL
};
