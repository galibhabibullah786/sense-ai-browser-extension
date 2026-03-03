// ============================================================================
// SenseAI Extension - Background Service Worker
// ============================================================================
// Handles:
// - WebSocket connection to backend
// - Signal collection orchestration
// - Analysis result caching
// - Offline queue management (fallback simulation)
// - Dark-pattern URL blocking
// - Extension ↔ Popup ↔ Content script messaging
// ============================================================================

import { io, Socket } from 'socket.io-client';
import type {
  AnalysisResult,
  ExtensionMessage,
  ExtensionStatus,
  PageSignals,
  CachedAnalysis,
  OfflineQueueItem,
  ExtensionSettings,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { generateId, getDomainFromUrl } from '../lib/utils';
import { simulateAnalysis, simulateExplanation } from './simulation';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const MAX_RECONNECT = 5;

// ============================================================================
// State
// ============================================================================

let extensionStatus: ExtensionStatus = {
  isAuthenticated: false,
  connectionStatus: 'offline',
  pendingAnalyses: 0,
  offlineQueueSize: 0,
};

let socket: Socket | null = null;
let reconnectAttempts = 0;
const pendingSignalCollections = new Map<number, (s: PageSignals) => void>();
let localBlocklist: Array<{ domain: string; reason: string }> = [];

// ============================================================================
// WebSocket Connection
// ============================================================================

function initializeWebSocket(token: string): void {
  if (socket?.connected) return;

  socket = io(BACKEND_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    reconnectionAttempts: MAX_RECONNECT,
  });

  socket.on('connect', () => {
    console.log('[SenseAI] Connected to backend');
    updateStatus({ connectionStatus: 'connected' });
    reconnectAttempts = 0;
    processOfflineQueue();
  });

  socket.on('disconnect', (reason) => {
    console.log('[SenseAI] Disconnected:', reason);
    updateStatus({ connectionStatus: 'disconnected' });
  });

  socket.on('connect_error', async () => {
    reconnectAttempts++;
    // On first failure, try refreshing the access token
    if (reconnectAttempts === 1) {
      const newToken = await refreshExtensionToken();
      if (newToken && socket) {
        socket.auth = { token: newToken };
      }
    }
    if (reconnectAttempts >= MAX_RECONNECT) {
      updateStatus({ connectionStatus: 'offline' });
    } else {
      updateStatus({ connectionStatus: 'connecting' });
    }
  });

  // Receive analysis results from backend
  socket.on('analysis:result', (data: { session: any }) => {
    handleBackendResult(data.session);
  });

  // Backend says URL is blocked (dark pattern)
  socket.on('url:blocked', (data: { blocked: boolean; reason?: string }) => {
    // Notify popup
    chrome.runtime.sendMessage({ type: 'URL_BLOCKED', ...data }).catch(() => {});
  });

  // Backend says extension has been unlinked from dashboard
  socket.on('extension:unlinked', async () => {
    console.log('[SenseAI] Extension unlinked from dashboard');
    await clearAuthTokens();
    updateStatus({ isAuthenticated: false, connectionStatus: 'offline' });
  });
}

function disconnectWebSocket(): void {
  if (socket) { socket.disconnect(); socket = null; }
  updateStatus({ connectionStatus: 'disconnected', isAuthenticated: false });
}

// ============================================================================
// Backend Analysis
// ============================================================================

async function handleBackendResult(session: any): Promise<void> {
  if (!session) return;

  const domain = session.domain || getDomainFromUrl(session.url);
  // Map backend session to AnalysisResult shape used by popup
  const mapped: AnalysisResult = {
    id: session.id,
    url: session.url,
    domain,
    trustScore: session.trust_score ?? session.trustScore ?? 0,
    verdict: session.verdict || 'warning',
    signalScores: session.signal_breakdown
      ? {
          cookies: session.signal_breakdown.cookies?.score ?? 100,
          trackers: session.signal_breakdown.trackers?.score ?? 100,
          fingerprinting: session.signal_breakdown.fingerprinting?.score ?? 100,
          headers: session.signal_breakdown.headers?.score ?? 100,
          ssl: session.signal_breakdown.ssl?.score ?? 100,
        }
      : { cookies: 100, trackers: 100, fingerprinting: 100, headers: 100, ssl: 100 },
    signals: { url: session.url, domain, timestamp: session.created_at || new Date().toISOString(), cookies: { count: 0, thirdPartyCount: 0, cookies: [] }, trackers: { detected: [], blocked: 0, scripts: [] }, fingerprinting: { techniques: [], risk: 'low' }, headers: { present: [], missing: [], issues: [] }, ssl: { valid: true } },
    analyzedAt: session.created_at || new Date().toISOString(),
    explanation: session.explanation
      ? { status: 'complete' as const, text: session.explanation.text, generatedAt: session.explanation.generated_at }
      : { status: 'pending' as const },
  };

  await setCachedResult(domain, mapped);

  // Notify popup
  chrome.runtime.sendMessage({ type: 'ANALYSIS_RESULT', result: mapped, fromCache: false }).catch(() => {});
}

async function sendBehaviorBatch(signals: PageSignals): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Not connected'));
      return;
    }

    socket.emit(
      'behavior:batch',
      {
        url: signals.url,
        timestamp: signals.timestamp,
        signals: {
          cookies: signals.cookies,
          trackers: signals.trackers,
          fingerprinting: signals.fingerprinting,
          headers: signals.headers,
          ssl: signals.ssl,
        },
      },
      (response: any) => {
        if (response?.type === 'url:blocked') {
          resolve({ blocked: true, reason: response.reason });
        } else if (response?.type === 'analysis:result') {
          resolve(response.session);
        } else if (response?.type === 'error') {
          reject(new Error(response.message));
        } else {
          resolve(response);
        }
      }
    );

    // Timeout
    setTimeout(() => reject(new Error('Backend analysis timeout')), 30000);
  });
}

async function checkUrlBlocked(url: string): Promise<{ blocked: boolean; reason?: string }> {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({ blocked: false });
      return;
    }
    socket.emit('url:check', { url }, (resp: any) => resolve(resp || { blocked: false }));
    setTimeout(() => resolve({ blocked: false }), 5000);
  });
}

async function processOfflineQueue(): Promise<void> {
  const queue = await getOfflineQueue();
  for (const item of queue) {
    if (!socket?.connected) break;
    try {
      await sendBehaviorBatch(item.signals);
      await removeFromOfflineQueue(item.id);
    } catch {
      // will retry later
    }
  }
}

// ============================================================================
// Storage Helpers
// ============================================================================

async function getCachedResult(domain: string): Promise<CachedAnalysis | null> {
  try {
    const result = await chrome.storage.local.get('cachedResults');
    const cached = result.cachedResults as Record<string, CachedAnalysis> | undefined;
    
    if (!cached?.[domain]) return null;
    
    const cachedItem = cached[domain];
    // Check if expired
    if (new Date(cachedItem.expiresAt) < new Date()) {
      // Remove expired cache
      delete cached[domain];
      await chrome.storage.local.set({ cachedResults: cached });
      return null;
    }
    
    return cachedItem;
  } catch (error) {
    console.error('[SenseAI] Error getting cached result:', error);
    return null;
  }
}

async function setCachedResult(domain: string, result: AnalysisResult): Promise<void> {
  try {
    const settings = await getSettings();
    const expirationHours = settings.cacheExpiration;
    
    const existing = await chrome.storage.local.get('cachedResults');
    const cached = (existing.cachedResults as Record<string, CachedAnalysis>) || {};
    
    cached[domain] = {
      result,
      cachedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expirationHours * 60 * 60 * 1000).toISOString(),
    };
    
    await chrome.storage.local.set({ cachedResults: cached });
  } catch (error) {
    console.error('[SenseAI] Error setting cached result:', error);
  }
}

async function getSettings(): Promise<ExtensionSettings> {
  try {
    const result = await chrome.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  try {
    const result = await chrome.storage.local.get('offlineQueue');
    return (result.offlineQueue as OfflineQueueItem[]) || [];
  } catch {
    return [];
  }
}

async function addToOfflineQueue(signals: PageSignals): Promise<void> {
  try {
    const queue = await getOfflineQueue();
    queue.push({
      id: generateId(),
      signals,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
    });
    await chrome.storage.local.set({ offlineQueue: queue });
    updateStatus({ offlineQueueSize: queue.length });
  } catch (error) {
    console.error('[SenseAI] Error adding to offline queue:', error);
  }
}

async function removeFromOfflineQueue(id: string): Promise<void> {
  try {
    const queue = await getOfflineQueue();
    const filtered = queue.filter(item => item.id !== id);
    await chrome.storage.local.set({ offlineQueue: filtered });
    updateStatus({ offlineQueueSize: filtered.length });
  } catch (error) {
    console.error('[SenseAI] Error removing from offline queue:', error);
  }
}

// ============================================================================
// Status Management
// ============================================================================

function updateStatus(partial: Partial<ExtensionStatus>): void {
  extensionStatus = { ...extensionStatus, ...partial };
  
  // Notify popup about status change
  chrome.runtime.sendMessage({
    type: 'STATUS_UPDATE',
    status: extensionStatus,
  }).catch(() => {
    // Popup might not be open, ignore error
  });
}

// ============================================================================
// Auth Helpers
// ============================================================================

async function getAuthToken(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get('authToken');
    return (result.authToken as string) || null;
  } catch { return null; }
}

async function getRefreshToken(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get('refreshToken');
    return (result.refreshToken as string) || null;
  } catch { return null; }
}

async function setAuthTokens(accessToken: string, refreshToken?: string): Promise<void> {
  const data: Record<string, string> = { authToken: accessToken };
  if (refreshToken) data.refreshToken = refreshToken;
  await chrome.storage.local.set(data);
  updateStatus({ isAuthenticated: true });
}

async function clearAuthTokens(): Promise<void> {
  await chrome.storage.local.remove(['authToken', 'refreshToken']);
  disconnectWebSocket();
}

async function refreshExtensionToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  try {
    const resp = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!resp.ok) {
      await clearAuthTokens();
      return null;
    }
    const data = await resp.json();
    await setAuthTokens(data.accessToken, data.refreshToken || refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

async function tryConnect(): Promise<void> {
  let token = await getAuthToken();
  if (!token) {
    // Access token missing; try to obtain a new one from refresh token
    token = await refreshExtensionToken();
  }
  if (token) {
    updateStatus({ isAuthenticated: true, connectionStatus: 'connecting' });
    initializeWebSocket(token);
  }
}

// ============================================================================
// Blocklist Cache
// ============================================================================

async function fetchBlocklist(): Promise<void> {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/whitelist/blocklist`);
    if (resp.ok) {
      const data = await resp.json();
      localBlocklist = data.blocklist || [];
      await chrome.storage.local.set({ cachedBlocklist: localBlocklist });
    }
  } catch {
    // Load from storage as fallback
    try {
      const stored = await chrome.storage.local.get('cachedBlocklist');
      localBlocklist = (stored.cachedBlocklist as typeof localBlocklist) || [];
    } catch {}
  }
}

function checkBlocklistLocally(url: string): { blocked: boolean; reason?: string } {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const entry = localBlocklist.find(e =>
      hostname === e.domain || hostname.endsWith('.' + e.domain)
    );
    if (entry) return { blocked: true, reason: entry.reason };
  } catch {}
  return { blocked: false };
}

// ============================================================================
// Analysis Handler — backend-first with simulation fallback
// ============================================================================

async function analyzeSignals(signals: PageSignals, tabId: number): Promise<AnalysisResult> {
  updateStatus({ pendingAnalyses: extensionStatus.pendingAnalyses + 1 });

  try {
    let result: AnalysisResult;

    if (socket?.connected) {
      // ── Backend path ─────────────────────────────────────────────────
      try {
        const session = await sendBehaviorBatch(signals);
        if (session?.blocked) {
          // URL is blocked → build a minimal result so popup can show warning
          result = buildBlockedResult(signals);
        } else if (session) {
          result = mapSessionToResult(session, signals);
        } else {
          // Empty response → fall through to simulation
          throw new Error('empty response');
        }
      } catch {
        // Backend failed → queue + simulate locally
        await addToOfflineQueue(signals);
        result = simulateAnalysis(signals);
        generateExplanationAsync(result);
      }
    } else {
      // ── Offline / simulation path ────────────────────────────────────
      await addToOfflineQueue(signals);
      result = simulateAnalysis(signals);
      generateExplanationAsync(result);
    }

    // Cache & store in session
    await setCachedResult(signals.domain, result);

    const sessionResults = await chrome.storage.session.get('currentTabResults');
    const tabResults = (sessionResults.currentTabResults as Record<number, AnalysisResult>) || {};
    tabResults[tabId] = result;
    await chrome.storage.session.set({ currentTabResults: tabResults });

    // Block browsing for critically low trust scores or danger verdict
    if (result.trustScore < 25 || result.verdict === 'danger') {
      const reason = result.trustScore < 15
        ? `Extremely low trust score (${result.trustScore}/100). This website exhibits highly dangerous behavior patterns.`
        : result.verdict === 'danger'
        ? `This website has been classified as dangerous (${result.trustScore}/100) based on analysis of its tracking, fingerprinting, and security practices.`
        : `Very low trust score (${result.trustScore}/100). Proceed with extreme caution.`;

      const blockUrl = chrome.runtime.getURL(
        `blocked.html?type=${result.trustScore < 15 ? 'critical-verdict' : 'low-trust'}&url=${encodeURIComponent(result.url)}&reason=${encodeURIComponent(reason)}&score=${result.trustScore}&verdict=${result.verdict}`
      );

      // Redirect the tab to the blocked page
      try {
        await chrome.tabs.update(tabId, { url: blockUrl });
      } catch {
        // Tab might have been closed
      }
    }

    return result;
  } finally {
    updateStatus({ pendingAnalyses: extensionStatus.pendingAnalyses - 1 });
  }
}

function mapSessionToResult(session: any, signals: PageSignals): AnalysisResult {
  const sb = session.signal_breakdown || {};
  return {
    id: session.id || generateId(),
    url: session.url || signals.url,
    domain: session.domain || signals.domain,
    trustScore: session.trust_score ?? session.trustScore ?? 0,
    verdict: session.verdict || 'warning',
    signalScores: {
      cookies: sb.cookies?.score ?? 100,
      trackers: sb.trackers?.score ?? 100,
      fingerprinting: sb.fingerprinting?.score ?? 100,
      headers: sb.headers?.score ?? 100,
      ssl: sb.ssl?.score ?? 100,
    },
    signals,
    analyzedAt: session.created_at || new Date().toISOString(),
    explanation: session.explanation
      ? { status: 'complete' as const, text: session.explanation.text, generatedAt: session.explanation.generated_at }
      : { status: 'pending' as const },
  };
}

function buildBlockedResult(signals: PageSignals): AnalysisResult {
  return {
    id: generateId(),
    url: signals.url,
    domain: signals.domain,
    trustScore: 0,
    verdict: 'danger',
    signalScores: { cookies: 0, trackers: 0, fingerprinting: 0, headers: 0, ssl: 0 },
    signals,
    analyzedAt: new Date().toISOString(),
    explanation: {
      status: 'complete',
      text: 'This website is on the blocklist as a known dark-pattern site. Navigation has been blocked to protect you.',
      generatedAt: new Date().toISOString(),
    },
  };
}

async function generateExplanationAsync(result: AnalysisResult): Promise<void> {
  // Simulation fallback for explanation
  await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));

  const explanation = simulateExplanation(result);

  const cached = await getCachedResult(result.domain);
  if (cached) {
    cached.result.explanation = { status: 'complete', text: explanation, generatedAt: new Date().toISOString() };
    await setCachedResult(result.domain, cached.result);
    chrome.runtime.sendMessage({ type: 'ANALYSIS_RESULT', result: cached.result, fromCache: true }).catch(() => {});
  }
}

// ============================================================================
// Message Handler
// ============================================================================

chrome.runtime.onMessage.addListener((
  message: ExtensionMessage, 
  sender: chrome.runtime.MessageSender, 
  sendResponse: (response?: unknown) => void
) => {
  const handleAsync = async (): Promise<unknown> => {
    switch (message.type) {
      case 'SIGNALS_COLLECTED': {
        const msg = message as { type: 'SIGNALS_COLLECTED'; signals: PageSignals };
        const tabId = sender.tab?.id;
        if (tabId && pendingSignalCollections.has(tabId)) {
          const resolver = pendingSignalCollections.get(tabId);
          resolver?.(msg.signals);
          pendingSignalCollections.delete(tabId);
        }
        return { success: true };
      }

      case 'ANALYZE_PAGE': {
        const msg = message as { type: 'ANALYZE_PAGE'; tabId: number; url: string };
        const domain = getDomainFromUrl(msg.url);
        const cached = await getCachedResult(domain);
        if (cached) return { result: cached.result, fromCache: true };

        const signals = await collectSignalsFromTab(msg.tabId, msg.url);
        const result = await analyzeSignals(signals, msg.tabId);
        return { result, fromCache: false };
      }

      case 'GET_CACHED_RESULT': {
        const msg = message as { type: 'GET_CACHED_RESULT'; domain: string };
        const cached = await getCachedResult(msg.domain);
        return { result: cached?.result || null };
      }

      case 'GET_STATUS':
        return { status: extensionStatus };

      case 'CLEAR_CACHE':
        await chrome.storage.local.set({ cachedResults: {} });
        return { success: true };

      case 'OPEN_DASHBOARD': {
        const settings = await getSettings();
        await chrome.tabs.create({ url: settings.dashboardUrl });
        return { success: true };
      }

      // ── Auth: link extension with dashboard via link-code ──────────
      case 'LINK_ACCOUNT': {
        const msg = message as { type: 'LINK_ACCOUNT'; code: string };
        try {
          const resp = await fetch(`${BACKEND_URL}/api/auth/verify-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ linkCode: msg.code }),
          });
          if (!resp.ok) throw new Error('Invalid or expired code');
          const data = await resp.json();
          await setAuthTokens(data.accessToken, data.refreshToken);
          initializeWebSocket(data.accessToken);
          // Refresh blocklist after linking
          fetchBlocklist();
          return { success: true };
        } catch (err: any) {
          return { error: err.message || 'Link failed' };
        }
      }

      case 'UNLINK_ACCOUNT': {
        // Notify backend to revoke the extension's refresh token
        let token = await getAuthToken();
        const rt = await getRefreshToken();
        // If access token is missing/expired, refresh it first so the logout call succeeds
        if (!token && rt) {
          token = await refreshExtensionToken();
        }
        if (token) {
          try {
            await fetch(`${BACKEND_URL}/api/auth/logout`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ refreshToken: rt }),
            });
          } catch { /* ignore – clear state regardless */ }
        }
        await clearAuthTokens();
        return { success: true };
      }

      case 'CHECK_URL': {
        const msg = message as { type: 'CHECK_URL'; url: string };
        const res = await checkUrlBlocked(msg.url);
        return res;
      }

      default:
        return { error: 'Unknown message type' };
    }
  };

  handleAsync()
    .then(sendResponse)
    .catch(error => sendResponse({ error: error.message }));

  return true; // async response
});

// ============================================================================
// Signal Collection from Content Script
// ============================================================================

async function collectSignalsFromTab(tabId: number, url: string): Promise<PageSignals> {
  return new Promise((resolve, reject) => {
    // Set up resolver for when content script responds
    pendingSignalCollections.set(tabId, resolve);
    
    // Request signals from content script
    chrome.tabs.sendMessage(tabId, { type: 'COLLECT_SIGNALS' })
      .catch(async () => {
        // Content script might not be loaded, inject it
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['src/content/index.ts'],
          });
          
          // Try again
          chrome.tabs.sendMessage(tabId, { type: 'COLLECT_SIGNALS' }).catch(reject);
        } catch (error) {
          pendingSignalCollections.delete(tabId);
          reject(error);
        }
      });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (pendingSignalCollections.has(tabId)) {
        pendingSignalCollections.delete(tabId);
        // Return basic signals if collection fails
        resolve({
          url,
          domain: getDomainFromUrl(url),
          timestamp: new Date().toISOString(),
          cookies: { count: 0, thirdPartyCount: 0, cookies: [] },
          trackers: { detected: [], blocked: 0, scripts: [] },
          fingerprinting: { techniques: [], risk: 'low' },
          headers: { present: [], missing: [], issues: [] },
          ssl: { valid: url.startsWith('https://') },
        });
      }
    }, 10000);
  });
}

// ============================================================================
// Extension Lifecycle
// ============================================================================

chrome.runtime.onInstalled.addListener(async (details: chrome.runtime.InstalledDetails) => {
  console.log('[SenseAI] Extension installed:', details.reason);
  
  const existing = await chrome.storage.local.get('settings');
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  const cacheResult = await chrome.storage.local.get('cachedResults');
  if (!cacheResult.cachedResults) {
    await chrome.storage.local.set({ cachedResults: {} });
  }

  // Fetch blocklist for offline URL blocking
  await fetchBlocklist();

  // Try to connect if auth token exists
  await tryConnect();
});

// ============================================================================
// Dark-Pattern URL Blocking — intercept navigation
// ============================================================================

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // only top-level
  if (!details.url.startsWith('http')) return;

  // Check for bypass flag (user chose "Proceed Anyway" on blocked page)
  try {
    const bypassData = await chrome.storage.session.get('bypassBlock');
    if (bypassData.bypassBlock === details.url) {
      await chrome.storage.session.remove('bypassBlock');
      return; // Allow navigation
    }
  } catch {}

  // 1. Check local blocklist cache first (works offline)
  const localCheck = checkBlocklistLocally(details.url);
  if (localCheck.blocked) {
    const warningUrl = chrome.runtime.getURL(
      `blocked.html?type=blocklist&url=${encodeURIComponent(details.url)}&reason=${encodeURIComponent(localCheck.reason || 'Known dark-pattern website')}`
    );
    chrome.tabs.update(details.tabId, { url: warningUrl });
    return;
  }

  // 2. Also check via backend socket if connected (real-time updates)
  if (socket?.connected) {
    const res = await checkUrlBlocked(details.url);
    if (res.blocked) {
      const warningUrl = chrome.runtime.getURL(
        `blocked.html?type=blocklist&url=${encodeURIComponent(details.url)}&reason=${encodeURIComponent(res.reason || 'Known dark-pattern website')}`
      );
      chrome.tabs.update(details.tabId, { url: warningUrl });
    }
  }
});

// Handle browser action (extension icon) click
chrome.action.onClicked.addListener(async (tab: chrome.tabs.Tab) => {
  console.log('[SenseAI] Extension icon clicked for tab:', tab.id);
});

// Log when service worker starts
console.log('[SenseAI] Background service worker initialized');

// Auto-connect on startup
tryConnect();

// Fetch blocklist on startup and refresh periodically (every 6 hours)
fetchBlocklist();
setInterval(fetchBlocklist, 6 * 60 * 60 * 1000);
