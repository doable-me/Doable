/**
 * Analytics Tracking Script
 *
 * Returns the client-side JavaScript that gets injected into preview iframes
 * and published sites. The script tracks page views, navigation, and time
 * on page in a privacy-friendly way:
 *
 * - No cookies — uses sessionStorage for session ID (cleared when tab closes)
 * - No fingerprinting — only collects device type and screen size
 * - SPA-aware — hooks into history.pushState, popstate, and hashchange
 * - Accurate time tracking — excludes time when tab is hidden
 * - Reliable unload — uses navigator.sendBeacon for page leave events
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
          duration: data.duration || 0
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
