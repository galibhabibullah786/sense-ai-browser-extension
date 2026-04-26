// ============================================================================
// Simulation Module for SenseAI Extension
// ============================================================================
// This module provides simulated analysis explanation when LLM is not available.
// ============================================================================

import type { AnalysisResult } from '../types';

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
