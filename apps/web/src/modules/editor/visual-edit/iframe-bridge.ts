// ─── Iframe Bridge Script ────────────────────────────────────
// This script is injected into the preview iframe to enable
// bidirectional communication for visual editing.
// It handles: hover highlighting, click-to-select, element
// info extraction, CSS selector generation, and parent selection.

export const IFRAME_BRIDGE_SCRIPT = `
(function() {
  // Prevent double-init
  if (window.__visualEditBridge) return;
  window.__visualEditBridge = true;

  let selectionEnabled = false;
  let selectedElement = null;
  let hoveredElement = null;

  // ─── Overlay Elements ──────────────────────────────────────
  const hoverOverlay = document.createElement('div');
  hoverOverlay.id = '__ve-hover-overlay';
  hoverOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:99998;border:2px solid rgba(99,102,241,0.6);background:rgba(99,102,241,0.08);display:none;transition:all 0.1s ease;border-radius:2px;';
  document.body.appendChild(hoverOverlay);

  const selectOverlay = document.createElement('div');
  selectOverlay.id = '__ve-select-overlay';
  selectOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:99999;border:2px solid #6366f1;background:rgba(99,102,241,0.05);display:none;border-radius:2px;';
  document.body.appendChild(selectOverlay);

  const tagLabel = document.createElement('div');
  tagLabel.id = '__ve-tag-label';
  tagLabel.style.cssText = 'position:fixed;pointer-events:none;z-index:100000;background:#6366f1;color:white;font-size:11px;font-weight:600;padding:2px 6px;border-radius:3px;font-family:ui-monospace,monospace;display:none;white-space:nowrap;';
  document.body.appendChild(tagLabel);

  // ─── Helper: CSS Selector Generator ────────────────────────
  function generateSelector(el) {
    if (el.id) return '#' + el.id;

    const parts = [];
    let current = el;
    let depth = 0;
    while (current && current !== document.body && depth < 5) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift('#' + current.id);
        break;
      }
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\\s+/).filter(c => !c.startsWith('__ve-')).slice(0, 3);
        if (classes.length > 0) selector += '.' + classes.join('.');
      }
      // nth-child for disambiguation
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children).filter(s => s.tagName === current.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          selector += ':nth-child(' + idx + ')';
        }
      }
      parts.unshift(selector);
      current = current.parentElement;
      depth++;
    }
    return parts.join(' > ');
  }

  // ─── Helper: Extract Element Info ──────────────────────────
  function extractElementInfo(el) {
    const rect = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const tag = el.tagName.toLowerCase();
    const isText = ['p','h1','h2','h3','h4','h5','h6','span','a','label','li','td','th','figcaption','caption','blockquote','em','strong','b','i','u','small','sub','sup','code','pre','abbr','cite','q','mark','time'].includes(tag);
    const isSvg = tag === 'svg' || el.closest('svg') !== null;
    const isIcon = isSvg || (el.children.length === 1 && el.children[0] && el.children[0].tagName && el.children[0].tagName.toLowerCase() === 'svg');
    const text = el.childNodes.length > 0
      ? Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').slice(0, 200)
      : '';

    return {
      tagName: tag,
      className: typeof el.className === 'string' ? el.className : '',
      textContent: text || el.textContent?.slice(0, 200) || '',
      selector: generateSelector(el),
      boundingRect: {
        top: rect.top, left: rect.left,
        width: rect.width, height: rect.height,
        bottom: rect.bottom, right: rect.right
      },
      computedStyles: {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        fontStyle: cs.fontStyle,
        textAlign: cs.textAlign,
        letterSpacing: cs.letterSpacing,
        lineHeight: cs.lineHeight,
        marginTop: cs.marginTop,
        marginRight: cs.marginRight,
        marginBottom: cs.marginBottom,
        marginLeft: cs.marginLeft,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        width: cs.width,
        height: cs.height,
        borderWidth: cs.borderWidth,
        borderColor: cs.borderColor,
        borderStyle: cs.borderStyle,
        borderRadius: cs.borderRadius,
        display: cs.display,
        flexDirection: cs.flexDirection,
        alignItems: cs.alignItems,
        justifyContent: cs.justifyContent,
        gap: cs.gap
      },
      isTextElement: isText || (text.length > 0 && el.children.length === 0),
      isIconElement: isIcon,
      hasChildren: el.children.length > 0,
      childCount: el.children.length
    };
  }

  // ─── Helper: Position Overlays ─────────────────────────────
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
    // Position above the element
    const labelTop = rect.top - 22;
    tagLabel.style.top = (labelTop < 4 ? rect.bottom + 4 : labelTop) + 'px';
    tagLabel.style.left = rect.left + 'px';
  }

  function hideOverlays() {
    hoverOverlay.style.display = 'none';
  }

  function hideSelection() {
    selectOverlay.style.display = 'none';
    tagLabel.style.display = 'none';
  }

  // ─── Helper: Should Ignore Element ─────────────────────────
  function shouldIgnore(el) {
    if (!el || el === document.body || el === document.documentElement) return true;
    if (el.id && el.id.startsWith('__ve-')) return true;
    return false;
  }

  // ─── Event Handlers ────────────────────────────────────────
  function onMouseMove(e) {
    if (!selectionEnabled) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (shouldIgnore(el) || el === hoveredElement) return;
    hoveredElement = el;
    if (el === selectedElement) {
      hideOverlays();
      return;
    }
    const rect = el.getBoundingClientRect();
    positionOverlay(hoverOverlay, rect);
    // Send hover info to parent
    const info = extractElementInfo(el);
    window.parent.postMessage({ type: 'visual-edit:element-hovered', element: info }, '*');
  }

  function onMouseLeave() {
    hoveredElement = null;
    hideOverlays();
    window.parent.postMessage({ type: 'visual-edit:element-hovered', element: null }, '*');
  }

  function onClick(e) {
    if (!selectionEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (shouldIgnore(el)) return;

    selectedElement = el;
    hoveredElement = null;
    hideOverlays();

    const rect = el.getBoundingClientRect();
    positionOverlay(selectOverlay, rect);
    const info = extractElementInfo(el);
    positionTagLabel(rect, info.tagName);

    window.parent.postMessage({ type: 'visual-edit:element-selected', element: info }, '*');
  }

  // ─── Reposition overlays on scroll/resize ──────────────────
  function updateSelectedOverlay() {
    if (!selectedElement || !document.contains(selectedElement)) {
      hideSelection();
      return;
    }
    const rect = selectedElement.getBoundingClientRect();
    positionOverlay(selectOverlay, rect);
    const tag = selectedElement.tagName.toLowerCase();
    positionTagLabel(rect, tag);
  }

  window.addEventListener('scroll', updateSelectedOverlay, true);
  window.addEventListener('resize', updateSelectedOverlay);

  // ─── Message Handler from Parent ───────────────────────────
  window.addEventListener('message', function(e) {
    const msg = e.data;
    if (!msg || !msg.type || !msg.type.startsWith('visual-edit:')) return;

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
          const rect = selectedElement.getBoundingClientRect();
          positionOverlay(selectOverlay, rect);
          const info = extractElementInfo(selectedElement);
          positionTagLabel(rect, info.tagName);
          window.parent.postMessage({ type: 'visual-edit:parent-selected', element: info }, '*');
        }
        break;

      case 'visual-edit:deselect':
        selectedElement = null;
        hideSelection();
        window.parent.postMessage({ type: 'visual-edit:element-deselected' }, '*');
        break;
    }
  });

  // Signal ready
  window.parent.postMessage({ type: 'visual-edit:ready' }, '*');
})();
`;
