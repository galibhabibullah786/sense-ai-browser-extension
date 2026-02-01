// ============================================================================
// Simulation Module for SenseAI Extension
// ============================================================================
// This module provides simulated analysis results when backend is not available.
// Replace with actual backend calls when the backend is implemented.
// ============================================================================

import type { AnalysisResult, PageSignals, SignalScores } from '../types';
import { generateId, getVerdictFromScore } from '../lib/utils';

// Known trusted domains for simulation
const TRUSTED_DOMAINS = [
  'google.com', 'www.google.com',
  'github.com', 'www.github.com',
  'stackoverflow.com', 'www.stackoverflow.com',
  'amazon.com', 'www.amazon.com',
  'microsoft.com', 'www.microsoft.com',
  'apple.com', 'www.apple.com',
  'facebook.com', 'www.facebook.com',
  'twitter.com', 'www.twitter.com', 'x.com',
  'linkedin.com', 'www.linkedin.com',
  'youtube.com', 'www.youtube.com',
  'netflix.com', 'www.netflix.com',
  'reddit.com', 'www.reddit.com',
  'wikipedia.org', 'en.wikipedia.org',
  'medium.com', 'www.medium.com',
  'vercel.app', 'vercel.com',
  'netlify.app', 'netlify.com',
  'cloudflare.com', 'www.cloudflare.com',
];

// Known suspicious patterns
const SUSPICIOUS_PATTERNS = [
  'free', 'prize', 'winner', 'click', 'urgent',
  'download', 'crack', 'keygen', 'warez',
  'casino', 'bet', 'lottery',
  '.xyz', '.top', '.click', '.loan', '.work',
];

// Common trackers for simulation
const COMMON_TRACKERS = [
  'Google Analytics',
  'Facebook Pixel',
  'Google Tag Manager',
  'Hotjar',
  'Mixpanel',
  'Segment',
  'Amplitude',
  'Intercom',
];

/**
 * Calculate signal scores based on collected signals
 */
function calculateSignalScores(signals: PageSignals, isTrusted: boolean, isSuspicious: boolean): SignalScores {
  let baseMultiplier = isTrusted ? 1.2 : isSuspicious ? 0.6 : 1.0;
  
  // Cookie score - based on third-party ratio and security flags
  let cookieScore = 85;
  if (signals.cookies.count > 0) {
    const thirdPartyRatio = signals.cookies.thirdPartyCount / signals.cookies.count;
    cookieScore -= Math.round(thirdPartyRatio * 30);
    
    // Check for secure cookies
    const secureCount = signals.cookies.cookies.filter(c => c.secure && c.httpOnly).length;
    const secureRatio = secureCount / Math.max(signals.cookies.count, 1);
    cookieScore += Math.round(secureRatio * 15);
  }
  
  // Tracker score - penalize many trackers
  let trackerScore = 90;
  trackerScore -= signals.trackers.detected.length * 5;
  trackerScore = Math.max(40, trackerScore);
  
  // Fingerprinting score
  let fingerprintScore = 95;
  const riskPenalty = { low: 0, medium: 20, high: 40 };
  fingerprintScore -= riskPenalty[signals.fingerprinting.risk];
  fingerprintScore -= signals.fingerprinting.techniques.length * 5;
  
  // Headers score
  let headerScore = 80;
  const requiredHeaders = ['Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options', 'Strict-Transport-Security'];
  const presentRequired = signals.headers.present.filter(h => requiredHeaders.includes(h)).length;
  headerScore += (presentRequired / requiredHeaders.length) * 20;
  headerScore -= signals.headers.missing.length * 5;
  headerScore -= signals.headers.issues.length * 10;
  
  // SSL score
  let sslScore = signals.ssl.valid ? 100 : 30;
  if (signals.ssl.valid && signals.ssl.issuer) {
    // Trusted CAs get bonus
    const trustedCAs = ['DigiCert', 'Let\'s Encrypt', 'Comodo', 'GlobalSign', 'GeoTrust'];
    if (trustedCAs.some(ca => signals.ssl.issuer?.includes(ca))) {
      sslScore = 100;
    }
  }
  
  // Apply base multiplier
  return {
    cookies: Math.min(100, Math.max(0, Math.round(cookieScore * baseMultiplier))),
    trackers: Math.min(100, Math.max(0, Math.round(trackerScore * baseMultiplier))),
    fingerprinting: Math.min(100, Math.max(0, Math.round(fingerprintScore * baseMultiplier))),
    headers: Math.min(100, Math.max(0, Math.round(headerScore * baseMultiplier))),
    ssl: Math.min(100, Math.max(0, Math.round(sslScore))),
  };
}

/**
 * Simulate analysis result for a set of signals
 */
export function simulateAnalysis(signals: PageSignals): AnalysisResult {
  const domain = signals.domain.toLowerCase();
  
  // Check if domain is trusted
  const isTrusted = TRUSTED_DOMAINS.some(td => 
    domain === td || domain.endsWith('.' + td.replace('www.', ''))
  );
  
  // Check for suspicious patterns
  const isSuspicious = SUSPICIOUS_PATTERNS.some(pattern => 
    domain.includes(pattern) || signals.url.toLowerCase().includes(pattern)
  );
  
  // Simulate signal detection if not already present
  const enhancedSignals = enhanceSignals(signals, isTrusted);
  
  // Calculate scores
  const signalScores = calculateSignalScores(enhancedSignals, isTrusted, isSuspicious);
  
  // Calculate overall trust score (weighted average)
  const weights = {
    ssl: 0.25,
    headers: 0.20,
    cookies: 0.20,
    trackers: 0.20,
    fingerprinting: 0.15,
  };
  
  const trustScore = Math.round(
    signalScores.ssl * weights.ssl +
    signalScores.headers * weights.headers +
    signalScores.cookies * weights.cookies +
    signalScores.trackers * weights.trackers +
    signalScores.fingerprinting * weights.fingerprinting
  );
  
  const verdict = getVerdictFromScore(trustScore);
  
  return {
    id: generateId(),
    url: signals.url,
    domain: signals.domain,
    trustScore,
    verdict,
    signalScores,
    signals: enhancedSignals,
    analyzedAt: new Date().toISOString(),
    explanation: {
      status: 'pending',
    },
  };
}

/**
 * Enhance signals with simulated data if detection was limited
 */
function enhanceSignals(signals: PageSignals, isTrusted: boolean): PageSignals {
  const enhanced = { ...signals };
  
  // Simulate trackers if none were detected
  if (signals.trackers.detected.length === 0) {
    const numTrackers = isTrusted ? 
      Math.floor(Math.random() * 3) : 
      Math.floor(Math.random() * 5) + 2;
    
    enhanced.trackers = {
      ...signals.trackers,
      detected: COMMON_TRACKERS.slice(0, numTrackers),
    };
  }
  
  // Simulate headers if none present
  if (signals.headers.present.length === 0 && signals.headers.missing.length === 0) {
    if (isTrusted) {
      enhanced.headers = {
        present: ['Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options', 'Strict-Transport-Security'],
        missing: ['Permissions-Policy'],
        issues: [],
      };
    } else {
      enhanced.headers = {
        present: ['X-Content-Type-Options'],
        missing: ['Content-Security-Policy', 'X-Frame-Options', 'Strict-Transport-Security', 'Permissions-Policy'],
        issues: ['Missing critical security headers'],
      };
    }
  }
  
  // Simulate fingerprinting detection
  if (signals.fingerprinting.techniques.length === 0) {
    const techniques = isTrusted ? 
      [] : 
      ['Canvas', 'WebGL'].slice(0, Math.floor(Math.random() * 2) + 1);
    
    enhanced.fingerprinting = {
      techniques,
      risk: techniques.length === 0 ? 'low' : techniques.length === 1 ? 'medium' : 'high',
    };
  }
  
  // Simulate SSL info
  if (enhanced.ssl.valid && !enhanced.ssl.issuer) {
    const issuers = ["Let's Encrypt", 'DigiCert Inc', 'GlobalSign', 'Comodo CA'];
    enhanced.ssl = {
      ...enhanced.ssl,
      issuer: issuers[Math.floor(Math.random() * issuers.length)],
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString(),
      protocol: 'TLS 1.3',
    };
  }
  
  return enhanced;
}

/**
 * Generate a simulated explanation based on the analysis result
 */
export function simulateExplanation(result: AnalysisResult): string {
  const { domain, trustScore, verdict, signalScores, signals } = result;
  
  const parts: string[] = [];
  
  // Opening statement based on verdict
  if (verdict === 'safe') {
    parts.push(`${domain} demonstrates strong security practices and can be considered trustworthy for most activities.`);
  } else if (verdict === 'warning') {
    parts.push(`${domain} shows mixed security signals. Exercise caution when sharing sensitive information.`);
  } else {
    parts.push(`${domain} raises several security concerns. We recommend avoiding this site or proceeding with extreme caution.`);
  }
  
  // SSL analysis
  if (signals.ssl.valid) {
    parts.push(`The site uses HTTPS with a valid SSL certificate${signals.ssl.issuer ? ` issued by ${signals.ssl.issuer}` : ''}, ensuring encrypted communication.`);
  } else {
    parts.push(`⚠️ This site does not use HTTPS, meaning your data could be intercepted. Avoid entering sensitive information.`);
  }
  
  // Security headers
  if (signalScores.headers >= 80) {
    parts.push(`Security headers are well-configured, including ${signals.headers.present.slice(0, 2).join(' and ')}.`);
  } else if (signals.headers.missing.length > 0) {
    parts.push(`Some security headers are missing (${signals.headers.missing.slice(0, 2).join(', ')}), which could leave users vulnerable to certain attacks.`);
  }
  
  // Trackers
  if (signals.trackers.detected.length > 0) {
    if (signalScores.trackers >= 70) {
      parts.push(`Standard analytics tools are present (${signals.trackers.detected.slice(0, 2).join(', ')}), which is common for most websites.`);
    } else {
      parts.push(`Multiple tracking scripts detected (${signals.trackers.detected.length} total), which may impact your privacy.`);
    }
  }
  
  // Cookies
  if (signals.cookies.thirdPartyCount > 3) {
    parts.push(`${signals.cookies.thirdPartyCount} third-party cookies were detected, suggesting extensive cross-site tracking.`);
  }
  
  // Fingerprinting
  if (signals.fingerprinting.risk !== 'low') {
    parts.push(`Browser fingerprinting techniques detected (${signals.fingerprinting.techniques.join(', ')}), which can be used to track you across websites.`);
  }
  
  // Summary
  parts.push(`\nOverall trust score: ${trustScore}/100.`);
  
  return parts.join(' ');
}
