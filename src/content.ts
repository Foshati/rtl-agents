/** Marker to identify injected link tag in workbench.html */
export const HTML_LINK_MARKER = 'rtl-agents.css'

/** Marker to identify injected script tag in workbench.html */
export const HTML_SCRIPT_MARKER = 'rtl-agents.js'

/** CSS file name placed in the workbench directory */
export const CSS_FILENAME = 'rtl-agents.css'

/** JS file name placed in the workbench directory */
export const JS_FILENAME = 'rtl-agents.js'

/**
 * Generate the CSS content.
 */
export function getRtlCss(): string {
  return `/* === RTL-AGENTS-CSS-START === */

/* Toggle button styling - always visible in the header */
#rtl-agents-toggle-btn {
  font-size: 14px !important;
  font-weight: bold !important;
  transition: opacity 0.2s, background 0.2s, color 0.2s;
  text-decoration: none !important;
  cursor: pointer !important;
}

#rtl-agents-toggle-btn.rtl-agents-active {
  color: var(--vscode-button-background, #4facfe) !important;
  opacity: 1 !important;
}

/* RTL mode active classes for elements containing RTL text */
.rtl-agents-is-rtl {
  direction: rtl !important;
  text-align: right !important;
}

/* --- Keep code and tables in LTR --- */
.rtl-agents-is-rtl pre,
.rtl-agents-is-rtl code,
.rtl-agents-is-rtl .interactive-result-code-block,
.rtl-agents-is-rtl .code-block-container,
.rtl-agents-is-rtl .monaco-editor,
.rtl-agents-is-rtl div[class*="code-block"],
.rtl-agents-is-rtl pre[class*="language-"] {
  direction: ltr !important;
  unicode-bidi: isolate !important;
  text-align: left !important;
}

.rtl-agents-is-rtl table {
  direction: ltr !important;
  text-align: left !important;
}

/* Adjust lists and checkboxes */
.rtl-agents-is-rtl ul,
.rtl-agents-is-rtl ol {
  padding-right: 20px !important;
  padding-left: 0 !important;
}

/* === RTL-AGENTS-CSS-END === */
`
}

/**
 * Generate the JS toggle button code with integrated settings.
 */
export function getRtlJs(customSelectors: string[], rtlRegexPattern: string): string {
  const defaultSelectors = [
    // Antigravity Chat Selectors
    '.antigravity-agent-side-panel .whitespace-pre-wrap.text-sm',
    '.antigravity-agent-side-panel .leading-relaxed.select-text > p',
    '.antigravity-agent-side-panel .leading-relaxed.select-text > ul',
    '.antigravity-agent-side-panel .leading-relaxed.select-text > ol',
    '.antigravity-agent-side-panel .leading-relaxed.select-text li',
    '.antigravity-agent-side-panel .leading-relaxed.select-text > h1',
    '.antigravity-agent-side-panel .leading-relaxed.select-text > h2',
    '.antigravity-agent-side-panel .leading-relaxed.select-text > h3',
    '.antigravity-agent-side-panel .leading-relaxed.select-text > h4',
    '.antigravity-agent-side-panel .leading-relaxed.select-text > blockquote',

    // Cursor Chat / Agent Selectors
    '.cursor-agent-side-panel .whitespace-pre-wrap',
    '.cursor-chat-panel .whitespace-pre-wrap',
    'div[class*="chat"] .whitespace-pre-wrap',
    'div[class*="chat-message"] p',
    'div[class*="chat-message"] li',
    'div[class*="chat"] p',
    'div[class*="chat"] li',

    // General VS Code Copilot & AI Chat Selectors
    '.chat-container p',
    '.chat-container li',
    '.chat-message-content p',
    '.chat-message-content li',
    '.interactive-session p',
    '.interactive-session li',
    '.renderer-html p',
    '.renderer-html li',
    '.markdown-content p',
    '.markdown-content li',
    '.select-text p',
    '.select-text li',
  ]

  const mergedSelectors = [...defaultSelectors, ...customSelectors]

  return `/* === RTL-AGENTS-JS-START === */
(function() {
  var BTN_ID = 'rtl-agents-toggle-btn';
  var BODY_CLASS = 'rtl-agents-mode-active';
  var STORAGE_KEY = 'rtl-agents-active-state';
  var RTL_REGEX = new RegExp(${JSON.stringify(rtlRegexPattern)});
  var SELECTORS = ${JSON.stringify(mergedSelectors)}.join(', ');

  function updateRtlElements() {
    var isActive = document.body.classList.contains(BODY_CLASS);
    if (!SELECTORS) return;

    var elements = document.querySelectorAll(SELECTORS);
    elements.forEach(function(el) {
      // Ensure we don't apply to code tags or other LTR islands
      if (
        el.tagName === 'PRE' || 
        el.tagName === 'CODE' || 
        el.closest('pre') || 
        el.closest('.interactive-result-code-block') ||
        el.closest('.monaco-editor')
      ) {
        return;
      }

      if (isActive && RTL_REGEX.test(el.textContent || '')) {
        el.classList.add('rtl-agents-is-rtl');
      } else {
        el.classList.remove('rtl-agents-is-rtl');
      }
    });
  }

  var updateTimeout;
  function scheduleUpdate() {
    if (updateTimeout) return;
    updateTimeout = setTimeout(function() {
      updateTimeout = null;
      updateRtlElements();
    }, 80);
  }

  function tryInsertButton() {
    if (document.getElementById(BTN_ID)) return;

    // List of candidate targets for chat panel header buttons
    var buttonSelectors = [
      'a[data-tooltip-id="new-conversation-tooltip"]', // Antigravity IDE
      'a[data-tooltip-id="new-chat-tooltip"]',         // Cursor default chat
      'div[class*="chat-header"] div[class*="actions"]', // Generic Header actions
      '.cursor-chat-header-actions',                   // Cursor chat panel header
      '.pane-header .actions',                         // General VS Code pane actions
      '.sidebar .composite.header'                     // Sidebar composite header
    ];

    var targetElement = null;
    for (var i = 0; i < buttonSelectors.length; i++) {
      targetElement = document.querySelector(buttonSelectors[i]);
      if (targetElement) break;
    }

    if (!targetElement) return;
    var targetContainer = targetElement.parentElement;
    if (!targetContainer) return;

    var btn = document.createElement('a');
    btn.id = BTN_ID;
    
    // Copy visual style from existing button to blend in perfectly
    btn.className = targetElement.className.replace(/cursor-not-allowed|opacity-\\d+/g, '').trim();
    btn.href = '#';
    btn.textContent = '\\u21C4'; // ⇄
    btn.title = 'Toggle RTL Mode (RTL Agents)';
    
    // Load persisted state
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') {
      document.body.classList.add(BODY_CLASS);
      btn.classList.add('rtl-agents-active');
    }

    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var isActive = document.body.classList.toggle(BODY_CLASS);
      btn.classList.toggle('rtl-agents-active', isActive);
      localStorage.setItem(STORAGE_KEY, isActive ? 'true' : 'false');
      scheduleUpdate();
    });

    // Insert next to the matching button
    if (targetElement.nextSibling) {
      targetContainer.insertBefore(btn, targetElement.nextSibling);
    } else {
      targetContainer.appendChild(btn);
    }
    
    scheduleUpdate();
  }

  // Monitor DOM changes to auto-patch dynamic chat messages and insert buttons
  var observer = new MutationObserver(function() {
    tryInsertButton();
    scheduleUpdate();
  });
  
  observer.observe(document.body, { childList: true, subtree: true });

  if (document.readyState !== 'loading') {
    tryInsertButton();
  } else {
    document.addEventListener('DOMContentLoaded', tryInsertButton);
  }
})();
/* === RTL-AGENTS-JS-END === */
`
}
