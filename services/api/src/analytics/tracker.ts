/**
 * Analytics Tracking
 *
 * Two parts:
 *
 * 1. **Client-side script** (getTrackingScript / getTrackingSnippet)
 *    Returns the JavaScript that gets injected into published sites.
 *    - No cookies — uses sessionStorage for session ID
 *    - SPA-aware — hooks into history.pushState, popstate, hashchange
 *    - Accurate time tracking — excludes time when tab is hidden
 *    - Reliable unload — uses navigator.sendBeacon
 *
 * 2. **Server-side helpers** (generateVisitorId, parseUserAgent, etc.)
 *    Privacy-friendly anonymous visitor IDs from IP + User-Agent hash.
 */

import { createHash } from "node:crypto";

// ─── Server-Side Helpers ──────────────────────────────────────

/**
 * Generate a privacy-friendly anonymous visitor ID from IP + User-Agent.
 * Uses a daily-rotating salt so the same visitor gets a different ID each
 * day, preventing long-term tracking while still allowing within-day
 * unique visitor counts.
 *
 * No cookies, no PII stored.
 */
export function generateVisitorId(req: {
  ip: string;
  userAgent: string;
}): string {
  const daySalt = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const raw = `${req.ip}:${req.userAgent}:${daySalt}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/**
 * Extract device type from a User-Agent string.
 * Returns "desktop", "mobile", or "tablet".
 */
export function parseUserAgent(ua: string): {
  deviceType: "desktop" | "mobile" | "tablet";
  browser: string;
  os: string;
} {
  // Device type
  let deviceType: "desktop" | "mobile" | "tablet" = "desktop";
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = "tablet";
  } else if (
    /mobile|iphone|ipod|android.*mobile|windows.*phone|blackberry/i.test(ua)
  ) {
    deviceType = "mobile";
  }

  // Browser detection (order matters)
  let browser = "Unknown";
  if (/edg(e|a)?\/\d/i.test(ua)) {
    browser = "Edge";
  } else if (/opr\/|opera/i.test(ua)) {
    browser = "Opera";
  } else if (/vivaldi/i.test(ua)) {
    browser = "Vivaldi";
  } else if (/brave/i.test(ua)) {
    browser = "Brave";
  } else if (/firefox|fxios/i.test(ua)) {
    browser = "Firefox";
  } else if (/crios|chrome/i.test(ua) && !/chromium/i.test(ua)) {
    browser = "Chrome";
  } else if (/chromium/i.test(ua)) {
    browser = "Chromium";
  } else if (/safari/i.test(ua) && !/chrome|chromium|crios/i.test(ua)) {
    browser = "Safari";
  } else if (/msie|trident/i.test(ua)) {
    browser = "Internet Explorer";
  }

  // OS detection
  let os = "Unknown";
  if (/iphone|ipad|ipod/i.test(ua)) {
    os = "iOS";
  } else if (/android/i.test(ua)) {
    os = "Android";
  } else if (/windows nt/i.test(ua)) {
    os = "Windows";
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = "macOS";
  } else if (/cros/i.test(ua)) {
    os = "Chrome OS";
  } else if (/linux/i.test(ua)) {
    os = "Linux";
  }

  return { deviceType, browser, os };
}

/**
 * Extract the client IP from request headers.
 * Handles x-forwarded-for, x-real-ip, and falls back to "unknown".
 */
export function extractClientIp(headers: {
  get(name: string): string | undefined | null;
}): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can be comma-separated; take the first (client) IP
    return forwarded.split(",")[0]!.trim();
  }
  return headers.get("x-real-ip") ?? "unknown";
}

// ─── Client-Side Tracking Script ──────────────────────────────

/**
 * Returns the full inline tracking script for injection into published apps.
 * ~1.5 KB unminified, privacy-friendly, no cookies.
 */
export function getTrackingScript(apiUrl: string): string {
  return `
    (function() {
      // Doable Analytics Tracker
      // Privacy-friendly: no cookies, no fingerprinting

      var API_URL = '${apiUrl}';
      var projectId = null;
      var sessionId = null;
      var currentPath = null;
      var pageStartTime = null;
      var isVisible = true;
      var totalHiddenTime = 0;
      var hiddenStart = null;

      // Extract project ID from meta tag or script data attribute
      function getProjectId() {
        var meta = document.querySelector('meta[name="doable-project-id"]');
        if (meta) return meta.getAttribute('content');
        var script = document.querySelector('script[data-project-id]');
        if (script) return script.getAttribute('data-project-id');
        // Try to extract from URL pattern /preview/{projectId}/
        var match = window.location.pathname.match(/\\/preview\\/([^\\/]+)/);
        if (match) return match[1];
        return null;
      }

      // Generate a random session ID (no cookies needed)
      function generateSessionId() {
        try {
          var stored = sessionStorage.getItem('_da_sid');
          if (stored) return stored;
          var id = 'ses_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
          sessionStorage.setItem('_da_sid', id);
          return id;
        } catch(e) {
          return 'ses_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
        }
      }

      // Detect device type
      function getDeviceType() {
        var ua = navigator.userAgent;
        if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
        if (/mobile|iphone|ipod|android.*mobile|windows.*phone|blackberry/i.test(ua)) return 'mobile';
        return 'desktop';
      }

      // Get referrer (clean it)
      function getReferrer() {
        if (!document.referrer) return null;
        try {
          var url = new URL(document.referrer);
          // Don't count self-referrals
          if (url.hostname === window.location.hostname) return null;
          return document.referrer;
        } catch(e) {
          return null;
        }
      }

      // Send tracking event
      function track(eventType, data) {
        if (!projectId) return;

        var payload = {
          projectId: projectId,
          sessionId: sessionId,
          eventType: eventType,
          path: data.path || window.location.pathname,
          referrer: data.referrer || null,
          deviceType: getDeviceType(),
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          duration: data.duration || 0,
          eventData: data.eventData || null
        };

        // Use sendBeacon for reliability (works even on page unload)
        if (navigator.sendBeacon) {
          navigator.sendBeacon(API_URL + '/analytics/track', JSON.stringify(payload));
        } else {
          var xhr = new XMLHttpRequest();
          xhr.open('POST', API_URL + '/analytics/track', true);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send(JSON.stringify(payload));
        }
      }

      // Calculate time spent on current page
      function getTimeOnPage() {
        if (!pageStartTime) return 0;
        var total = Date.now() - pageStartTime - totalHiddenTime;
        return Math.max(0, total);
      }

      // Track page visibility changes
      function handleVisibilityChange() {
        if (document.hidden) {
          isVisible = false;
          hiddenStart = Date.now();
        } else {
          isVisible = true;
          if (hiddenStart) {
            totalHiddenTime += Date.now() - hiddenStart;
            hiddenStart = null;
          }
        }
      }

      // Track page view
      function trackPageView() {
        // Send duration for previous page if any
        if (currentPath && currentPath !== window.location.pathname) {
          track('page_leave', { path: currentPath, duration: getTimeOnPage() });
        }

        currentPath = window.location.pathname;
        pageStartTime = Date.now();
        totalHiddenTime = 0;
        hiddenStart = null;

        track('page_view', {
          path: currentPath,
          referrer: getReferrer()
        });
      }

      // Track custom event (exposed as window._da.trackEvent)
      function trackCustomEvent(eventName, eventData) {
        track('custom', {
          path: window.location.pathname,
          eventData: { name: eventName, data: eventData || {} }
        });
      }

      // Track when user leaves
      function trackLeave() {
        if (currentPath) {
          track('page_leave', { path: currentPath, duration: getTimeOnPage() });
        }
      }

      // Initialize
      function init() {
        projectId = getProjectId();
        if (!projectId) return;

        sessionId = generateSessionId();

        // Track initial page view
        trackPageView();

        // Listen for navigation changes (SPA support)
        // 1. History API
        var originalPushState = history.pushState;
        history.pushState = function() {
          originalPushState.apply(this, arguments);
          setTimeout(trackPageView, 0);
        };

        var originalReplaceState = history.replaceState;
        history.replaceState = function() {
          originalReplaceState.apply(this, arguments);
          setTimeout(trackPageView, 0);
        };

        window.addEventListener('popstate', function() {
          setTimeout(trackPageView, 0);
        });

        // 2. Hash changes
        window.addEventListener('hashchange', trackPageView);

        // 3. Visibility changes (for accurate time tracking)
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // 4. Track leave
        window.addEventListener('beforeunload', trackLeave);
        window.addEventListener('pagehide', trackLeave);

        // Expose trackEvent for custom events
        window._da = { trackEvent: trackCustomEvent };
      }

      // Start tracking when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    })();
  `;
}

/**
 * Returns a minimal tracking snippet (~500 bytes minified) that published
 * apps can include via a <script> tag. Loads the full tracker asynchronously.
 *
 * Usage in published HTML:
 *   <meta name="doable-project-id" content="PROJECT_ID_HERE">
 *   <script src="https://api.doable.dev/analytics/script.js" defer></script>
 *
 * Or inline:
 *   <script>{{ getTrackingSnippet(apiUrl, projectId) }}</script>
 */
export function getTrackingSnippet(apiUrl: string, projectId: string): string {
  return `<meta name="doable-project-id" content="${projectId}"><script src="${apiUrl}/analytics/script.js" defer></script>`;
}
