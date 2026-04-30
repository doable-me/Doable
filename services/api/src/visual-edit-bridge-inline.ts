/**
 * Visual Edit Bridge Script (inline version)
 *
 * This script is injected inline into preview HTML before </body>.
 * It enables visual editing by communicating with the parent editor
 * via postMessage. Handles: element hover highlighting, click-to-select,
 * element info extraction, CSS selector generation, and parent selection.
 */
export const VISUAL_EDIT_BRIDGE_INLINE = `
(function() {
  if (window.__visualEditBridge) return;
  window.__visualEditBridge = true;

  // ─── Doable theme sync ──────────────────────────────────────
  // Parent (Doable editor) posts {type:"doable-theme", theme:"dark"|"light"}
  // on iframe load and whenever the user toggles theme. Mirror it onto the
  // preview's <html> so Tailwind \`dark:\` classes resolve correctly and the
  // user-agent canvas color matches.
  function applyDoableTheme(theme) {
    var t = theme === "dark" ? "dark" : "light";
    var root = document.documentElement;
    if (t === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    root.setAttribute("data-theme", t);
    try { root.style.colorScheme = t; } catch (e) {}
  }
  window.addEventListener("message", function(e) {
    if (!e.data || e.data.type !== "doable-theme") return;
    applyDoableTheme(e.data.theme);
  });
  // Tell parent we're ready to receive a theme so it can push the current one.
  try {
    window.parent.postMessage({ type: "doable-theme-ready" }, "*");
  } catch (e) {}

  var selectionEnabled = false;
  var selectedElement = null;
  var hoveredElement = null;

  var hoverOverlay = document.createElement('div');
  hoverOverlay.id = '__ve-hover-overlay';
  hoverOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:99998;border:2px solid rgba(99,102,241,0.6);background:rgba(99,102,241,0.08);display:none;transition:all 0.1s ease;border-radius:2px;';
  document.body.appendChild(hoverOverlay);

  var selectOverlay = document.createElement('div');
  selectOverlay.id = '__ve-select-overlay';
  selectOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:99999;border:2px solid #6366f1;background:rgba(99,102,241,0.05);display:none;border-radius:2px;';
  document.body.appendChild(selectOverlay);

  var tagLabel = document.createElement('div');
  tagLabel.id = '__ve-tag-label';
  tagLabel.style.cssText = 'position:fixed;pointer-events:none;z-index:100000;background:#6366f1;color:white;font-size:11px;font-weight:600;padding:2px 6px;border-radius:3px;font-family:ui-monospace,monospace;display:none;white-space:nowrap;';
  document.body.appendChild(tagLabel);

  function generateSelector(el) {
    if (el.id) return '#' + el.id;
    var parts = [];
    var current = el;
    var depth = 0;
    while (current && current !== document.body && depth < 5) {
      var selector = current.tagName.toLowerCase();
      if (current.id) { parts.unshift('#' + current.id); break; }
      if (current.className && typeof current.className === 'string') {
        var classes = current.className.trim().split(/\\s+/).filter(function(c) { return c.indexOf('__ve-') !== 0; }).slice(0, 3);
        if (classes.length > 0) selector += '.' + classes.join('.');
      }
      if (current.parentElement) {
        var siblings = Array.from(current.parentElement.children).filter(function(s) { return s.tagName === current.tagName; });
        if (siblings.length > 1) {
          var idx = siblings.indexOf(current) + 1;
          selector += ':nth-child(' + idx + ')';
        }
      }
      parts.unshift(selector);
      current = current.parentElement;
      depth++;
    }
    return parts.join(' > ');
  }

  function extractElementInfo(el) {
    var rect = el.getBoundingClientRect();
    var cs = window.getComputedStyle(el);
    var tag = el.tagName.toLowerCase();
    var textTags = ['p','h1','h2','h3','h4','h5','h6','span','a','label','li','td','th','figcaption','caption','blockquote','em','strong','b','i','u','small','code','pre'];
    var isText = textTags.indexOf(tag) !== -1;
    var isSvg = tag === 'svg' || el.closest('svg') !== null;
    var isIcon = isSvg || (el.children.length === 1 && el.children[0] && el.children[0].tagName && el.children[0].tagName.toLowerCase() === 'svg');
    var text = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) text += (el.childNodes[i].textContent || '').trim() + ' ';
    }
    text = text.trim().slice(0, 200);
    if (!text) text = (el.textContent || '').slice(0, 200);

    var sourceLocation = null;
    var sourceEl = el;
    while (sourceEl && sourceEl !== document.body && sourceEl !== document.documentElement) {
      var srcAttr = sourceEl.getAttribute('data-source');
      if (srcAttr) {
        var parts = srcAttr.split(':');
        if (parts.length >= 3) {
          var colStr = parts.pop();
          var lineStr = parts.pop();
          var filePath = parts.join(':');
          var lineNum = parseInt(lineStr, 10);
          var colNum = parseInt(colStr, 10);
          if (filePath && !isNaN(lineNum) && !isNaN(colNum)) {
            sourceLocation = { file: filePath, line: lineNum, col: colNum };
          }
        }
        break;
      }
      sourceEl = sourceEl.parentElement;
    }

    return {
      tagName: tag,
      className: typeof el.className === 'string' ? el.className : '',
      textContent: text,
      selector: generateSelector(el),
      boundingRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right },
      computedStyles: {
        color: cs.color, backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontStyle: cs.fontStyle,
        textAlign: cs.textAlign, letterSpacing: cs.letterSpacing, lineHeight: cs.lineHeight,
        marginTop: cs.marginTop, marginRight: cs.marginRight, marginBottom: cs.marginBottom, marginLeft: cs.marginLeft,
        paddingTop: cs.paddingTop, paddingRight: cs.paddingRight, paddingBottom: cs.paddingBottom, paddingLeft: cs.paddingLeft,
        width: cs.width, height: cs.height,
        borderWidth: cs.borderWidth, borderColor: cs.borderColor, borderStyle: cs.borderStyle, borderRadius: cs.borderRadius,
        display: cs.display, flexDirection: cs.flexDirection, alignItems: cs.alignItems, justifyContent: cs.justifyContent, gap: cs.gap
      },
      isTextElement: isText || (text.length > 0 && el.children.length === 0),
      isIconElement: isIcon,
      hasChildren: el.children.length > 0,
      childCount: el.children.length,
      sourceLocation: sourceLocation
    };
  }

  function positionOverlay(overlay, rect) {
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.display = 'block';
  }

  function positionTagLabel(rect, tagText) {
    tagLabel.textContent = tagText;
    tagLabel.style.display = 'block';
    var labelTop = rect.top - 22;
    tagLabel.style.top = (labelTop < 4 ? rect.bottom + 4 : labelTop) + 'px';
    tagLabel.style.left = rect.left + 'px';
  }

  function hideOverlays() { hoverOverlay.style.display = 'none'; }
  function hideSelection() { selectOverlay.style.display = 'none'; tagLabel.style.display = 'none'; }

  function shouldIgnore(el) {
    if (!el || el === document.body || el === document.documentElement) return true;
    if (el.id && el.id.indexOf('__ve-') === 0) return true;
    return false;
  }

  var lastCursorBroadcast = 0;
  function onMouseMove(e) {
    if (!selectionEnabled) return;
    // Relay cursor position to parent for collaborative cursors
    var now = Date.now();
    if (now - lastCursorBroadcast > 50) {
      lastCursorBroadcast = now;
      window.parent.postMessage({ type: 'visual-edit:cursor-in-preview', x: e.clientX, y: e.clientY }, '*');
    }
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (shouldIgnore(el) || el === hoveredElement) return;
    hoveredElement = el;
    if (el === selectedElement) { hideOverlays(); return; }
    positionOverlay(hoverOverlay, el.getBoundingClientRect());
  }

  function onMouseLeave() { hoveredElement = null; hideOverlays(); }

  function onClick(e) {
    if (!selectionEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (shouldIgnore(el)) return;
    selectedElement = el;
    hoveredElement = null;
    hideOverlays();
    var rect = el.getBoundingClientRect();
    positionOverlay(selectOverlay, rect);
    var info = extractElementInfo(el);
    positionTagLabel(rect, info.tagName);
    window.parent.postMessage({ type: 'visual-edit:element-selected', element: info }, '*');
  }

  function updateSelectedOverlay() {
    if (!selectedElement || !document.contains(selectedElement)) { hideSelection(); return; }
    var rect = selectedElement.getBoundingClientRect();
    positionOverlay(selectOverlay, rect);
    positionTagLabel(rect, selectedElement.tagName.toLowerCase());
  }

  window.addEventListener('scroll', updateSelectedOverlay, true);
  window.addEventListener('resize', updateSelectedOverlay);

  window.addEventListener('message', function(e) {
    var msg = e.data;
    if (!msg || !msg.type || typeof msg.type !== 'string') return;

    // Handle element rect queries for collaborative selection overlays
    if (msg.type === '__doable_get_element_rect') {
      var el = msg.selector ? document.querySelector(msg.selector) : null;
      var rect = el ? el.getBoundingClientRect() : null;
      window.parent.postMessage({
        type: '__doable_element_rect_response',
        userId: msg.userId,
        rect: rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null
      }, '*');
      return;
    }

    if (msg.type.indexOf('visual-edit:') !== 0) return;
    switch(msg.type) {
      case 'visual-edit:enable-selection':
        selectionEnabled = true;
        document.body.style.cursor = 'crosshair';
        document.addEventListener('mousemove', onMouseMove, true);
        document.addEventListener('mouseleave', onMouseLeave, true);
        document.addEventListener('click', onClick, true);
        break;
      case 'visual-edit:disable-selection':
        selectionEnabled = false;
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onMouseMove, true);
        document.removeEventListener('mouseleave', onMouseLeave, true);
        document.removeEventListener('click', onClick, true);
        hoveredElement = null;
        hideOverlays();
        hideSelection();
        selectedElement = null;
        break;
      case 'visual-edit:select-parent':
        if (selectedElement && selectedElement.parentElement && selectedElement.parentElement !== document.body) {
          selectedElement = selectedElement.parentElement;
          var r = selectedElement.getBoundingClientRect();
          positionOverlay(selectOverlay, r);
          var info = extractElementInfo(selectedElement);
          positionTagLabel(r, info.tagName);
          window.parent.postMessage({ type: 'visual-edit:parent-selected', element: info }, '*');
        }
        break;
      case 'visual-edit:deselect':
        selectedElement = null;
        hideSelection();
        window.parent.postMessage({ type: 'visual-edit:element-deselected' }, '*');
        break;
      case 'visual-edit:apply-style':
        if (selectedElement && msg.property && msg.value !== undefined) {
          if (!window.__veOriginalStyles) window.__veOriginalStyles = {};
          if (!(msg.property in window.__veOriginalStyles)) {
            window.__veOriginalStyles[msg.property] = selectedElement.style[msg.property] || '';
          }
          selectedElement.style[msg.property] = msg.value;
          updateSelectedOverlay();
        }
        break;
      case 'visual-edit:apply-text':
        if (selectedElement && msg.text !== undefined) {
          if (!window.__veOriginalText) {
            var origText = '';
            for (var ti = 0; ti < selectedElement.childNodes.length; ti++) {
              if (selectedElement.childNodes[ti].nodeType === 3) { origText = selectedElement.childNodes[ti].textContent || ''; break; }
            }
            window.__veOriginalText = origText;
            window.__veOriginalTextEl = selectedElement;
          }
          var found = false;
          for (var tn = 0; tn < selectedElement.childNodes.length; tn++) {
            if (selectedElement.childNodes[tn].nodeType === 3) { selectedElement.childNodes[tn].textContent = msg.text; found = true; break; }
          }
          if (!found) { selectedElement.textContent = msg.text; }
          updateSelectedOverlay();
        }
        break;
      case 'visual-edit:revert-changes':
        if (selectedElement && window.__veOriginalStyles) {
          var props = Object.keys(window.__veOriginalStyles);
          for (var ri = 0; ri < props.length; ri++) {
            selectedElement.style[props[ri]] = window.__veOriginalStyles[props[ri]];
          }
        }
        if (window.__veOriginalTextEl && window.__veOriginalText !== undefined) {
          var revFound = false;
          for (var rn = 0; rn < window.__veOriginalTextEl.childNodes.length; rn++) {
            if (window.__veOriginalTextEl.childNodes[rn].nodeType === 3) { window.__veOriginalTextEl.childNodes[rn].textContent = window.__veOriginalText; revFound = true; break; }
          }
          if (!revFound) { window.__veOriginalTextEl.textContent = window.__veOriginalText; }
        }
        window.__veOriginalStyles = {};
        window.__veOriginalText = undefined;
        window.__veOriginalTextEl = undefined;
        if (selectedElement) updateSelectedOverlay();
        break;
      case 'visual-edit:highlight-element':
        if (msg.selector) {
          try {
            var targetEl = document.querySelector(msg.selector);
            if (targetEl && !shouldIgnore(targetEl)) {
              selectedElement = targetEl;
              hoveredElement = null;
              hideOverlays();
              var hr = targetEl.getBoundingClientRect();
              positionOverlay(selectOverlay, hr);
              var hinfo = extractElementInfo(targetEl);
              positionTagLabel(hr, hinfo.tagName);
              window.parent.postMessage({ type: 'visual-edit:element-selected', element: hinfo }, '*');
            }
          } catch (qe) { /* invalid selector, ignore */ }
        }
        break;
    }
  });

  // Send ready immediately and keep retrying indefinitely until parent acknowledges.
  // The parent may not have its listener set up yet (React hook mounts asynchronously).
  window.parent.postMessage({ type: 'visual-edit:ready' }, '*');
  var readyInterval = setInterval(function() {
    window.parent.postMessage({ type: 'visual-edit:ready' }, '*');
  }, 1000);

  // Stop retrying once parent sends any visual-edit message back (means it's listening)
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type && typeof e.data.type === 'string' && e.data.type.indexOf('visual-edit:') === 0) {
      clearInterval(readyInterval);
    }
  });
})();
`;
