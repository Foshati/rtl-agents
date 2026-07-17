/** Marker to identify injected link tag in workbench.html */
export const HTML_LINK_MARKER = 'rtl-agents.css'

/** Marker to identify injected script tag in workbench.html */
export const HTML_SCRIPT_MARKER = 'rtl-agents.js'

/** CSS file name placed in the workbench directory */
export const CSS_FILENAME = 'rtl-agents.css'

/** JS file name placed in the workbench directory */
export const JS_FILENAME = 'rtl-agents.js'

/** RTL CSS rules — injected as a separate file in the workbench directory */
export const RTL_CSS = `/* === RTL-AGENTS-CSS-START === */

/* ==========================================
   Toggle button - always visible in chat header
   ========================================== */

#rtl-agents-toggle-btn {
    font-size: 14px !important;
    font-weight: bold !important;
    transition: opacity 0.2s, background 0.2s;
    text-decoration: none !important;
    cursor: pointer !important;
}

#rtl-agents-toggle-btn.rtl-agents-active {
    color: #ff9f0a !important; /* Active color indicator */
}

/* ==========================================
   RTL mode - active only for elements containing RTL text
   ========================================== */

.rtl-agents-is-rtl {
    direction: rtl !important;
    text-align: right !important;
}

/* --- MUST STAY LTR --- */

/* Code blocks and inline code */
.rtl-agents-is-rtl pre,
.rtl-agents-is-rtl code,
.rtl-agents-is-rtl .interactive-result-code-block,
.rtl-agents-is-rtl .code-block-container {
    direction: ltr !important;
    unicode-bidi: isolate !important;
    text-align: left !important;
}

/* Tables */
.rtl-agents-is-rtl table {
    direction: ltr !important;
    text-align: left !important;
}

/* === RTL-AGENTS-CSS-END === */
`

/** RTL JS toggle button code — injected as a separate file in the workbench directory */
export const RTL_JS = `/* === RTL-AGENTS-JS-START === */
(function() {
    var BTN_ID = 'rtl-agents-toggle-btn';
    var BODY_CLASS = 'rtl-agents-mode-active';
    var STORAGE_KEY = 'rtl-agents-active-state';
    var RTL_REGEX = /[\\u0590-\\u05FF\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/;

    function checkStatusBarState() {
        var elements = document.querySelectorAll('.status-bar-item, [id*="rtl-agents"]');
        for (var i = 0; i < elements.length; i++) {
            var text = elements[i].textContent || '';
            if (text.includes('⇄ RTL')) {
                return true;
            }
            if (text.includes('⇄ LTR')) {
                return false;
            }
        }
        return null;
    }

    function updateRtlElements() {
        var isActive = false;
        var statusBarActive = checkStatusBarState();

        if (statusBarActive !== null) {
            isActive = statusBarActive;
            localStorage.setItem(STORAGE_KEY, isActive ? 'true' : 'false');
        } else {
            var saved = localStorage.getItem(STORAGE_KEY);
            isActive = (saved === 'true');
        }

        if (isActive) {
            document.body.classList.add(BODY_CLASS);
            var btn = document.getElementById(BTN_ID);
            if (btn) btn.classList.add('rtl-agents-active');
        } else {
            document.body.classList.remove(BODY_CLASS);
            var btn = document.getElementById(BTN_ID);
            if (btn) btn.classList.remove('rtl-agents-active');
        }

        var selectors = [
            '.antigravity-agent-side-panel .whitespace-pre-wrap.text-sm',
            '.antigravity-agent-side-panel .leading-relaxed.select-text > p',
            '.antigravity-agent-side-panel .leading-relaxed.select-text > ul',
            '.antigravity-agent-side-panel .leading-relaxed.select-text > ol',
            '.antigravity-agent-side-panel .leading-relaxed.select-text li',
            '.antigravity-agent-side-panel .leading-relaxed.select-text > h1',
            '.antigravity-agent-side-panel .leading-relaxed.select-text > h2',
            '.antigravity-agent-side-panel .leading-relaxed.select-text > h3',
            '.antigravity-agent-side-panel .leading-relaxed.select-text > h4',
            '.antigravity-agent-side-panel .leading-relaxed.select-text > blockquote'
        ].join(', ');

        var elements = document.querySelectorAll(selectors);

        elements.forEach(function(el) {
            // Skip code blocks
            if (el.tagName === 'PRE' || el.tagName === 'CODE' || el.closest('pre') || el.closest('.interactive-result-code-block')) {
                return;
            }

            if (isActive && RTL_REGEX.test(el.textContent)) {
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
        }, 100);
    }

    function tryInsertButton() {
        if (document.getElementById(BTN_ID)) return;

        // Find the New Chat button
        var newChatBtn = document.querySelector('a[data-tooltip-id="new-conversation-tooltip"]');
        if (!newChatBtn) return;

        var targetContainer = newChatBtn.parentElement;
        if (!targetContainer) return;

        var btn = document.createElement('a');
        btn.id = BTN_ID;
        // Copy classes from the New Chat button to match styling perfectly
        btn.className = newChatBtn.className.replace(/cursor-not-allowed|opacity-\\d+/g, '').trim();
        btn.href = 'command:rtl-agents.toggle';
        btn.textContent = '\\u21C4'; // ⇄
        btn.title = 'Toggle RTL mode (RTL Agents)';

        // Restore saved state
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'true') {
            document.body.classList.add(BODY_CLASS);
            btn.classList.add('rtl-agents-active');
        }

        btn.addEventListener('click', function(e) {
            // Let the command execution run naturally to sync the status bar item in the extension host
            scheduleUpdate();
        });

        // Insert after the new chat button (to the right of it)
        if (newChatBtn.nextSibling) {
            targetContainer.insertBefore(btn, newChatBtn.nextSibling);
        } else {
            targetContainer.appendChild(btn);
        }
        scheduleUpdate();
    }

    // Watch for DOM changes (panels loading/unloading)
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
