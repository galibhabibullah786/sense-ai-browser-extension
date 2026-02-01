// ============================================================================
// SenseAI Extension - Content Script
// ============================================================================
// This script runs in the context of web pages and collects security signals.
// It communicates with the background service worker via chrome.runtime.
// ============================================================================

import type { PageSignals, CookieInfo, CookieSignal, TrackerSignal, FingerprintSignal, HeaderSignal, SSLSignal } from '../types';

// ============================================================================
// Signal Collection Functions
// ============================================================================

/**
 * Get the current page's domain
 */
function getDomain(): string {
  return window.location.hostname;
}

/**
 * Collect cookie information
 */
function collectCookies(): CookieSignal {
  const cookieString = document.cookie;
  const cookies: CookieInfo[] = [];
  const domain = getDomain();
  
  if (cookieString) {
    const cookiePairs = cookieString.split(';');
    
    for (const pair of cookiePairs) {
      const [name] = pair.trim().split('=');
      if (name) {
        cookies.push({
          name: name.trim(),
          domain: domain, // Document cookies are always first-party from JS perspective
          secure: window.location.protocol === 'https:',
          httpOnly: false, // Can't detect HttpOnly from JavaScript (they're not accessible)
        });
      }
    }
  }
  
  // Count third-party cookies (we can only see first-party from JS, but we estimate)
  // In real implementation, this would come from webRequest API in background script
  const thirdPartyEstimate = Math.floor(cookies.length * 0.3);
  
  return {
    count: cookies.length,
    thirdPartyCount: thirdPartyEstimate,
    cookies,
  };
}

/**
 * Detect tracking scripts on the page
 */
function detectTrackers(): TrackerSignal {
  const detected: string[] = [];
  const scripts: string[] = [];
  
  // Common tracker patterns
  const trackerPatterns: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /google-analytics\.com|googletagmanager\.com|ga\.js|gtag/i, name: 'Google Analytics' },
    { pattern: /facebook\.net|fbevents\.js|facebook\.com\/tr/i, name: 'Facebook Pixel' },
    { pattern: /googletagmanager\.com\/gtm/i, name: 'Google Tag Manager' },
    { pattern: /hotjar\.com/i, name: 'Hotjar' },
    { pattern: /mixpanel\.com/i, name: 'Mixpanel' },
    { pattern: /segment\.com|segment\.io/i, name: 'Segment' },
    { pattern: /amplitude\.com/i, name: 'Amplitude' },
    { pattern: /intercom\.io|intercomcdn\.com/i, name: 'Intercom' },
    { pattern: /clarity\.ms/i, name: 'Microsoft Clarity' },
    { pattern: /doubleclick\.net/i, name: 'DoubleClick' },
    { pattern: /adsense/i, name: 'Google AdSense' },
    { pattern: /twitter\.com\/i\/adsct|ads-twitter\.com/i, name: 'Twitter Ads' },
    { pattern: /linkedin\.com.*\/li\.lms-analytics/i, name: 'LinkedIn Insight' },
    { pattern: /snap\.licdn\.com|px\.ads\.linkedin\.com/i, name: 'LinkedIn Pixel' },
    { pattern: /tiktok\.com.*analytics|analytics\.tiktok\.com/i, name: 'TikTok Pixel' },
    { pattern: /pinterest\.com.*tag/i, name: 'Pinterest Tag' },
    { pattern: /criteo\.com|criteo\.net/i, name: 'Criteo' },
    { pattern: /taboola\.com/i, name: 'Taboola' },
    { pattern: /outbrain\.com/i, name: 'Outbrain' },
    { pattern: /quantserve\.com/i, name: 'Quantcast' },
    { pattern: /scorecardresearch\.com/i, name: 'comScore' },
    { pattern: /newrelic\.com|nr-data\.net/i, name: 'New Relic' },
    { pattern: /sentry\.io|sentry-cdn\.com/i, name: 'Sentry' },
  ];
  
  // Check all script tags
  const scriptElements = document.querySelectorAll('script[src]');
  scriptElements.forEach(script => {
    const src = script.getAttribute('src') || '';
    scripts.push(src);
    
    for (const tracker of trackerPatterns) {
      if (tracker.pattern.test(src) && !detected.includes(tracker.name)) {
        detected.push(tracker.name);
      }
    }
  });
  
  // Also check inline scripts for common patterns
  const inlineScripts = document.querySelectorAll('script:not([src])');
  inlineScripts.forEach(script => {
    const content = script.textContent || '';
    
    for (const tracker of trackerPatterns) {
      if (tracker.pattern.test(content) && !detected.includes(tracker.name)) {
        detected.push(tracker.name);
      }
    }
  });
  
  // Check for tracking pixels (1x1 images)
  const images = document.querySelectorAll('img');
  images.forEach(img => {
    const src = img.getAttribute('src') || '';
    const width = img.width || img.naturalWidth;
    const height = img.height || img.naturalHeight;
    
    // Tracking pixels are usually 1x1 or 0x0
    if ((width <= 1 && height <= 1) || src.includes('/pixel') || src.includes('/beacon')) {
      for (const tracker of trackerPatterns) {
        if (tracker.pattern.test(src) && !detected.includes(tracker.name)) {
          detected.push(tracker.name);
        }
      }
    }
  });
  
  return {
    detected,
    blocked: 0, // Would need webRequest API to track blocked scripts
    scripts: scripts.slice(0, 20), // Limit to first 20 scripts
  };
}

/**
 * Detect fingerprinting techniques
 */
function detectFingerprinting(): FingerprintSignal {
  const techniques: string[] = [];
  
  // Check for canvas fingerprinting
  // This is a heuristic - we check if canvas toDataURL or getImageData is being used
  try {
    const canvasCheck = document.querySelector('canvas');
    if (canvasCheck) {
      techniques.push('Canvas');
    }
  } catch {
    // Ignore errors
  }
  
  // Check for WebGL fingerprinting
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
    if (gl) {
      // WebGL is available - doesn't mean it's being used for fingerprinting
      // but it's a capability check
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        // Site can access WebGL renderer info
        const scripts = Array.from(document.querySelectorAll('script'));
        const hasWebGLFingerprint = scripts.some(s => 
          (s.textContent || '').includes('WEBGL_debug_renderer_info')
        );
        if (hasWebGLFingerprint) {
          techniques.push('WebGL');
        }
      }
    }
  } catch {
    // Ignore errors
  }
  
  // Check for Audio fingerprinting
  try {
    const scripts = Array.from(document.querySelectorAll('script'));
    const hasAudioFingerprint = scripts.some(s => {
      const content = s.textContent || '';
      return content.includes('AudioContext') && content.includes('createOscillator');
    });
    if (hasAudioFingerprint) {
      techniques.push('Audio');
    }
  } catch {
    // Ignore errors
  }
  
  // Check for font fingerprinting
  try {
    const scripts = Array.from(document.querySelectorAll('script'));
    const hasFontFingerprint = scripts.some(s => {
      const content = s.textContent || '';
      return content.includes('measureText') && content.includes('font');
    });
    if (hasFontFingerprint) {
      techniques.push('Fonts');
    }
  } catch {
    // Ignore errors
  }
  
  // Determine risk level
  let risk: 'low' | 'medium' | 'high' = 'low';
  if (techniques.length >= 3) {
    risk = 'high';
  } else if (techniques.length >= 1) {
    risk = 'medium';
  }
  
  return {
    techniques,
    risk,
  };
}

/**
 * Analyze security headers (limited from content script)
 * Note: Full header analysis requires webRequest API in background script
 */
function analyzeHeaders(): HeaderSignal {
  // We can't directly access response headers from content script
  // This would need to be enhanced with data from background script
  
  // Check for some indicators we can detect from the page
  const present: string[] = [];
  const missing: string[] = [];
  const issues: string[] = [];
  
  // Check Content-Security-Policy via meta tag
  const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (cspMeta) {
    present.push('Content-Security-Policy (meta)');
  }
  
  // Check for X-Frame-Options indicator (if we're not in an iframe, it might be set)
  // This is a weak heuristic
  if (window.self === window.top) {
    // We're not in an iframe - could mean X-Frame-Options is set, but not definitive
  }
  
  // Check for Referrer-Policy
  const referrerMeta = document.querySelector('meta[name="referrer"]');
  if (referrerMeta) {
    present.push('Referrer-Policy (meta)');
  }
  
  // Note about limitations
  if (present.length === 0) {
    issues.push('Header analysis limited - requires background script for full HTTP header inspection');
  }
  
  return {
    present,
    missing,
    issues,
  };
}

/**
 * Check SSL/TLS status
 */
function checkSSL(): SSLSignal {
  const isSecure = window.location.protocol === 'https:';
  
  return {
    valid: isSecure,
    // Additional SSL info (issuer, expiry) requires accessing certificate info
    // which is not available from content scripts
  };
}

/**
 * Collect all signals from the current page
 */
function collectAllSignals(): PageSignals {
  return {
    url: window.location.href,
    domain: getDomain(),
    timestamp: new Date().toISOString(),
    cookies: collectCookies(),
    trackers: detectTrackers(),
    fingerprinting: detectFingerprinting(),
    headers: analyzeHeaders(),
    ssl: checkSSL(),
  };
}

// ============================================================================
// Message Handler
// ============================================================================

interface ContentMessage {
  type: string;
}

chrome.runtime.onMessage.addListener((
  message: ContentMessage, 
  _sender: chrome.runtime.MessageSender, 
  sendResponse: (response: { success: boolean; error?: string }) => void
) => {
  if (message.type === 'COLLECT_SIGNALS') {
    try {
      const signals = collectAllSignals();
      
      // Send signals back to background script
      chrome.runtime.sendMessage({
        type: 'SIGNALS_COLLECTED',
        signals,
      });
      
      sendResponse({ success: true });
    } catch (error) {
      console.error('[SenseAI] Error collecting signals:', error);
      sendResponse({ success: false, error: (error as Error).message });
    }
  }
  
  return true; // Keep message channel open for async response
});

// ============================================================================
// Auto-collection on page load (optional, based on settings)
// ============================================================================

// Notify background that content script is loaded
chrome.runtime.sendMessage({
  type: 'CONTENT_SCRIPT_READY',
  url: window.location.href,
  domain: getDomain(),
}).catch(() => {
  // Background might not be listening for this message
});

console.log('[SenseAI] Content script loaded for:', getDomain());
