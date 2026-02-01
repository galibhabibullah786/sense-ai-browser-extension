// ============================================================================
// SenseAI Extension - Background Service Worker
// ============================================================================
// This service worker handles:
// - Communication between popup, content scripts, and (future) backend
// - Signal collection orchestration
// - Analysis result caching
// - Offline queue management
// - WebSocket connection to backend (when implemented)
// ============================================================================

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

// ============================================================================
// State Management
// ============================================================================

let extensionStatus: ExtensionStatus = {
  isAuthenticated: false,
  connectionStatus: 'offline', // Start as offline since backend isn't implemented
  pendingAnalyses: 0,
  offlineQueueSize: 0,
};

// Store for pending signal collections
const pendingSignalCollections: Map<number, (signals: PageSignals) => void> = new Map();

// ============================================================================
// WebSocket Connection (COMMENTED - Backend not implemented yet)
// ============================================================================

/*
// TODO: Uncomment when backend is ready
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
const BACKEND_URL = 'http://localhost:3000';
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectAttempts = 0;

function initializeWebSocket(token: string): void {
  if (socket?.connected) return;

  socket = io(BACKEND_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
  });

  socket.on('connect', () => {
    console.log('[SenseAI] Connected to backend');
    updateStatus({ connectionStatus: 'connected' });
    reconnectAttempts = 0;
    processOfflineQueue();
  });

  socket.on('disconnect', (reason) => {
    console.log('[SenseAI] Disconnected from backend:', reason);
    updateStatus({ connectionStatus: 'disconnected' });
  });

  socket.on('connect_error', (error) => {
    console.error('[SenseAI] Connection error:', error);
    reconnectAttempts++;
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      updateStatus({ connectionStatus: 'offline' });
    } else {
      updateStatus({ connectionStatus: 'connecting' });
    }
  });

  // Handle analysis results from backend
  socket.on('analysis:result', (result: AnalysisResult) => {
    handleAnalysisResult(result);
  });

  // Handle explanation updates (streaming)
  socket.on('explanation:update', (data: { sessionId: string; text: string; status: string }) => {
    handleExplanationUpdate(data);
  });

  // Handle rate limiting
  socket.on('rate:limited', (data: { retryAfter: number }) => {
    console.warn('[SenseAI] Rate limited, retry after:', data.retryAfter);
    // Notify popup about rate limiting
  });
}

function disconnectWebSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  updateStatus({ connectionStatus: 'disconnected' });
}

async function sendToBackend(event: string, data: unknown): Promise<void> {
  if (!socket?.connected) {
    // Queue for later if offline
    await addToOfflineQueue(data as PageSignals);
    return;
  }
  socket.emit(event, data);
}

async function processOfflineQueue(): Promise<void> {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return;

  console.log(`[SenseAI] Processing ${queue.length} queued items`);
  
  for (const item of queue) {
    if (socket?.connected) {
      socket.emit('analyze:signals', {
        signals: item.signals,
        queueId: item.id,
      });
      await removeFromOfflineQueue(item.id);
    }
  }
}
*/

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
// Analysis Handler (Simulation Mode)
// ============================================================================

async function analyzeSignals(signals: PageSignals, tabId: number): Promise<AnalysisResult> {
  updateStatus({ pendingAnalyses: extensionStatus.pendingAnalyses + 1 });
  
  try {
    // ========================================================================
    // SIMULATION MODE - Replace with backend call when ready
    // ========================================================================
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
    
    // Generate simulated analysis result
    const result = simulateAnalysis(signals);
    
    // Cache the result
    await setCachedResult(signals.domain, result);
    
    // Store in session for current tab
    const sessionResults = await chrome.storage.session.get('currentTabResults');
    const tabResults = (sessionResults.currentTabResults as Record<number, AnalysisResult>) || {};
    tabResults[tabId] = result;
    await chrome.storage.session.set({ currentTabResults: tabResults });
    
    // Start generating explanation asynchronously
    generateExplanationAsync(result);
    
    return result;
    
    // ========================================================================
    // BACKEND INTEGRATION (COMMENTED - Uncomment when backend is ready)
    // ========================================================================
    /*
    return new Promise((resolve, reject) => {
      if (!socket?.connected) {
        // Queue for offline processing
        addToOfflineQueue(signals);
        reject(new Error('Backend not available'));
        return;
      }

      const analysisId = generateId();
      
      // Set up one-time listener for this analysis
      const resultHandler = (result: AnalysisResult) => {
        if (result.id === analysisId) {
          socket?.off('analysis:result', resultHandler);
          setCachedResult(signals.domain, result);
          resolve(result);
        }
      };
      
      socket.on('analysis:result', resultHandler);
      
      // Send signals to backend
      socket.emit('analyze:signals', {
        id: analysisId,
        signals,
        tabId,
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        socket?.off('analysis:result', resultHandler);
        reject(new Error('Analysis timeout'));
      }, 30000);
    });
    */
  } finally {
    updateStatus({ pendingAnalyses: extensionStatus.pendingAnalyses - 1 });
  }
}

async function generateExplanationAsync(result: AnalysisResult): Promise<void> {
  // Simulate explanation generation (in real implementation, this comes from backend via WebSocket)
  await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
  
  const explanation = simulateExplanation(result);
  
  // Update the cached result with explanation
  const cached = await getCachedResult(result.domain);
  if (cached) {
    cached.result.explanation = {
      status: 'complete',
      text: explanation,
      generatedAt: new Date().toISOString(),
    };
    await setCachedResult(result.domain, cached.result);
    
    // Notify popup about updated explanation
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_RESULT',
      result: cached.result,
      fromCache: true,
    }).catch(() => {
      // Popup might not be open
    });
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
  // Handle async responses
  const handleAsync = async (): Promise<unknown> => {
    switch (message.type) {
      case 'SIGNALS_COLLECTED': {
        const msg = message as { type: 'SIGNALS_COLLECTED'; signals: PageSignals };
        // Resolve pending signal collection
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
        
        // First, try to get from cache
        const domain = getDomainFromUrl(msg.url);
        const cached = await getCachedResult(domain);
        
        if (cached) {
          return { result: cached.result, fromCache: true };
        }
        
        // Collect signals from the content script
        const signals = await collectSignalsFromTab(msg.tabId, msg.url);
        
        // Analyze the signals
        const result = await analyzeSignals(signals, msg.tabId);
        
        return { result, fromCache: false };
      }

      case 'GET_CACHED_RESULT': {
        const msg = message as { type: 'GET_CACHED_RESULT'; domain: string };
        const cached = await getCachedResult(msg.domain);
        return { result: cached?.result || null };
      }

      case 'GET_STATUS': {
        return { status: extensionStatus };
      }

      case 'CLEAR_CACHE': {
        await chrome.storage.local.set({ cachedResults: {} });
        return { success: true };
      }

      case 'OPEN_DASHBOARD': {
        const settings = await getSettings();
        await chrome.tabs.create({ url: settings.dashboardUrl });
        return { success: true };
      }

      default:
        return { error: 'Unknown message type' };
    }
  };

  handleAsync()
    .then(sendResponse)
    .catch(error => sendResponse({ error: error.message }));

  // Return true to indicate async response
  return true;
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
  
  // Initialize default settings
  const existing = await chrome.storage.local.get('settings');
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  
  // Initialize empty cache
  const cacheResult = await chrome.storage.local.get('cachedResults');
  if (!cacheResult.cachedResults) {
    await chrome.storage.local.set({ cachedResults: {} });
  }
});

// Handle browser action (extension icon) click
chrome.action.onClicked.addListener(async (tab: chrome.tabs.Tab) => {
  // Popup will open automatically due to manifest configuration
  console.log('[SenseAI] Extension icon clicked for tab:', tab.id);
});

// Log when service worker starts
console.log('[SenseAI] Background service worker initialized');
