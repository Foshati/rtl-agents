import type { ContentOptions } from './types'
import { decideDirection, isSettled, rangesToClass, STRONG_LTR_RANGES, STRONG_RTL_RANGES } from './bidi'

/** Opening sentinel of the injected block in workbench HTML */
export const PATCH_BEGIN = '<!-- RTL-AGENTS-BEGIN -->'

/** Closing sentinel of the injected block in workbench HTML */
export const PATCH_END = '<!-- RTL-AGENTS-END -->'

/** CSS file name placed in the workbench directory */
export const CSS_FILENAME = 'rtl-agents.css'

/** JS file name placed in the workbench directory */
export const JS_FILENAME = 'rtl-agents.js'

/** Manifest file name placed next to the assets */
export const MANIFEST_FILENAME = 'rtl-agents.manifest.json'

/** Glyph used by both the status bar item and the injected header button */
export const TOGGLE_GLYPH = '⇄'

/** localStorage key shared by every patched document (same origin) */
export const STORAGE_KEY = 'rtl-agents-active-state'

/**
 * Chat panels, used only as a scope prefix — never flipped wholesale.
 *
 * Flipping a panel would re-align its toolbars and buttons too, which is the
 * mistake v1 made. Direction is applied to message text inside, not to these.
 */
const PANEL_ROOT_SELECTORS = [
  '.antigravity-agent-side-panel',
  '.rtl-agents-root',
  '.interactive-session',
  '.chat-container',
]

/**
 * Message roots that identify themselves, matched without a panel prefix.
 *
 * `md-divider-spacing` is Antigravity's markdown wrapper: a semantic class rather
 * than a utility, carried in both the workbench and the standalone agent bundle,
 * and unchanged from 2.5.5 to 2.6.0 while the panel class and the paragraph
 * wrapper we used to rely on were both removed.
 *
 * The user's own message is found through its test id — test ids are what the
 * host's end-to-end tests select by, so they outlive styling. Only the text inside
 * the bubble is a root: the bubble itself is a flex row of icons whose layout
 * must not flip.
 */
const SELF_IDENTIFYING_ROOTS = [
  '.md-divider-spacing',
  '[data-testid="user-message-bubble"] > .flex-1',
  '[data-testid="user-message-bubble"] .whitespace-pre-wrap',
]

/**
 * Generic markdown classes. The editor renders hovers, the settings editor and
 * extension pages with the same classes, so they only count as chat messages
 * inside a chat panel. 2.2.0 matched them everywhere, which flipped those too.
 */
const PANEL_MARKDOWN_CLASSES = [
  '.rendered-markdown',
  '.markdown-body',
  '.markdown',
]

/** Block-level text, for `auto` mode and for panels without a markdown root. */
const BLOCK_TEXT_SELECTORS = [
  'p',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'dd',
  'dt',
  'td',
  'th',
  'figcaption',
  'summary',
  '.whitespace-pre-wrap',
]

const LIST_SELECTORS = [
  'ul',
  'ol',
]

/**
 * The composer, where per-paragraph resolution is the right call: it should flip
 * live as you type. Antigravity's editor is Lexical, which renders paragraphs
 * inside the editable — and `unicode-bidi` does not inherit, so they are listed.
 */
const COMPOSER_SELECTORS = [
  '[data-testid="agent-input-box"] [contenteditable="true"]',
  '[data-testid="agent-input-box"] [contenteditable="true"] :is(p, div)',
  '[data-testid="agent-input-box"] textarea',
]

const PANEL_INPUT_SELECTORS = [
  'textarea',
  '[contenteditable="true"]',
]

/**
 * Runs that keep LTR order regardless of the text around them. `isolate` keeps
 * them from disturbing the bidi resolution of the sentence they sit in.
 */
const LTR_SELECTORS = [
  'pre',
  'code',
  'kbd',
  'samp',
  '.monaco-editor',
  '.interactive-result-code-block',
  '.code-block-container',
  '.katex',
  '.mermaid',
]

/** The block-level subset: alignment is only pinned where a block box exists. */
const LTR_BLOCK_SELECTORS = [
  'pre',
  '.monaco-editor',
  '.interactive-result-code-block',
  '.code-block-container',
]

/** Left out of the letter count: code reads the same whatever prose surrounds it. */
const NON_PROSE_SELECTORS = [
  'pre',
  'code',
  'kbd',
  'samp',
  '.katex',
  '.mermaid',
  '.monaco-editor',
]

/** Attribute the runtime stamps on each message root and table in `smart` mode. */
export const DIR_ATTR = 'data-rtl-agents-dir'

function list(selectors: string[]): string {
  return selectors.join(', ')
}

function panelSelectors(options: ContentOptions): string[] {
  return [...PANEL_ROOT_SELECTORS, ...options.customSelectors]
}

/** Every selector that identifies a whole chat message. */
export function messageRootSelectors(options: ContentOptions): string[] {
  const panelMarkdown = panelSelectors(options)
    .flatMap(panel => PANEL_MARKDOWN_CLASSES.map(cls => `${panel} ${cls}`))
  return [...SELF_IDENTIFYING_ROOTS, ...panelMarkdown]
}

/**
 * Hosts set alignment and spacing with physical properties that ignore
 * `direction`: Antigravity compiles `[&_ol]:pl-10` and `[&>ol]:!pl-4` to
 * `padding-left`, draws the quote bar with an inline `borderLeft`, and gives
 * table headers `text-left`. Inside an RTL message each is replaced with its
 * logical counterpart, mirroring the host's own values.
 */
function rtlPolish(scope: string): string {
  return `${scope} :is(th, td, .text-left) {
  text-align: start !important;
}

${scope} :is(ul, ol) {
  padding-left: 0 !important;
  padding-inline-start: 2.5rem !important;
}

${scope} > :is(ul, ol):not(.contains-task-list) {
  padding-inline-start: 1.25rem !important;
}

${scope} > :is(ul, ol).contains-task-list {
  padding-inline-start: 0 !important;
}

${scope} blockquote {
  border-left: none !important;
  border-inline-start: 4px solid var(--border, var(--vscode-textBlockQuote-border, currentColor)) !important;
}`
}

function smartDirectionCss(): string {
  const rtl = `html.rtl-agents-on [${DIR_ATTR}="rtl"]`
  return `/* Each message, and each table, carries the direction the runtime decided
   for it. The runtime runs inside the mutation that renders the text, so the
   attribute is in place before the frame is painted. */
${rtl} {
  direction: rtl !important;
  text-align: start !important;
}

html.rtl-agents-on [${DIR_ATTR}="ltr"] {
  direction: ltr !important;
}

${rtlPolish(rtl)}`
}

function pinnedDirectionCss(roots: string, panels: string, blocks: string): string {
  const scope = `html.rtl-agents-on :is(${roots})`
  return `/* Every message is pinned to an RTL base. The direction property inherits,
   so whatever the renderer emits inside the markdown root follows it. */
${scope} {
  direction: rtl !important;
  text-align: start !important;
}

/* Panels whose chat is not wrapped in a markdown root of its own. */
html.rtl-agents-on :is(${panels}) :is(${blocks}) {
  direction: rtl !important;
  text-align: start !important;
}

${rtlPolish(scope)}`
}

function autoDirectionCss(roots: string, panels: string, blocks: string): string {
  return `/* Legacy: each paragraph resolves its own direction from its first strong
   character. Lists keep the host's layout. */
html.rtl-agents-on :is(${roots}) :is(${blocks}),
html.rtl-agents-on :is(${panels}) :is(${blocks}) {
  unicode-bidi: plaintext !important;
  text-align: start !important;
}`
}

/**
 * Build the RTL stylesheet. Everything is gated behind `html.rtl-agents-on`, so
 * toggling is a single class flip on the root element.
 */
export function buildCss(options: ContentOptions): string {
  const version = options.extensionVersion ?? 'dev'
  const panels = list(panelSelectors(options))
  const roots = list(messageRootSelectors(options))
  const blocks = list([...BLOCK_TEXT_SELECTORS, ...LIST_SELECTORS])
  const composer = list([
    ...COMPOSER_SELECTORS,
    ...PANEL_INPUT_SELECTORS.map(input => `:is(${panels}) ${input}`),
  ])

  const direction = options.baseDirection === 'smart'
    ? smartDirectionCss()
    : options.baseDirection === 'rtl'
      ? pinnedDirectionCss(roots, panels, blocks)
      : autoDirectionCss(roots, panels, list(BLOCK_TEXT_SELECTORS))

  return `/* === RTL-AGENTS-CSS-START === */
/* Generated by RTL Agents — do not edit by hand. */
/* base direction: ${options.baseDirection} */

/* Lets a running window report which stylesheet it actually loaded. */
:root {
  --rtl-agents-version: "${version}";
  --rtl-agents-mode: "${options.baseDirection}";
}

/* ==========================================
   Header toggle button
   ========================================== */

#rtl-agents-toggle-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 14px !important;
  font-weight: bold !important;
  line-height: 1 !important;
  cursor: pointer !important;
  user-select: none !important;
  text-decoration: none !important;
  transition: opacity 0.15s ease, color 0.15s ease;
}

#rtl-agents-toggle-btn:hover {
  opacity: 0.8 !important;
}

#rtl-agents-toggle-btn.rtl-agents-active {
  color: #ff9f0a !important;
}

/* ==========================================
   Message direction
   ========================================== */

${direction}

/* ==========================================
   Composer — resolves per paragraph on purpose,
   so it flips live while you type.
   ========================================== */

html.rtl-agents-on :is(${composer}) {
  unicode-bidi: plaintext !important;
  text-align: start !important;
}

/* ==========================================
   Layout safety — these never flip
   ========================================== */

/* Isolation keeps an inline code span from disturbing the bidi resolution of
   the sentence around it, and the sentence from reordering the span. */
html.rtl-agents-on :is(${list(LTR_SELECTORS)}) {
  direction: ltr !important;
  unicode-bidi: isolate !important;
}

/* Alignment is pinned only where a block box exists — forcing it on an inline
   <code> would fight the alignment of the paragraph holding it. */
html.rtl-agents-on :is(${list(LTR_BLOCK_SELECTORS)}) {
  text-align: left !important;
}

/* === RTL-AGENTS-CSS-END === */
`
}

/**
 * Build the injected runtime.
 *
 * It sets the root class before first paint, injects the header toggle button,
 * keeps in sync with the extension host through the status bar item, and — in
 * `smart` mode — decides each message's direction. That decision runs inside a
 * MutationObserver callback, which the browser delivers as a microtask before the
 * frame is painted, so a message never renders in one direction and then jumps.
 *
 * `window.__rtlAgents.diagnose()` reports what a live window actually loaded.
 */
export function buildJs(options: ContentOptions): string {
  const version = options.extensionVersion ?? 'dev'
  return `/* === RTL-AGENTS-JS-START === */
/* Generated by RTL Agents — do not edit by hand. */
(function () {
  'use strict';

  try {
    var DOC = document;
    var HTML = DOC.documentElement;
    var VERSION = ${JSON.stringify(version)};
    var MODE = ${JSON.stringify(options.baseDirection)};
    var BTN_ID = 'rtl-agents-toggle-btn';
    var ON_CLASS = 'rtl-agents-on';
    var STANDALONE_CLASS = 'rtl-agents-standalone';
    var ACTIVE_CLASS = 'rtl-agents-active';
    var STORAGE_KEY = ${JSON.stringify(STORAGE_KEY)};
    var DIR_ATTR = ${JSON.stringify(DIR_ATTR)};
    var ROOT_SELECTOR = ${JSON.stringify(list(messageRootSelectors(options)))};
    var NON_PROSE_SELECTOR = ${JSON.stringify(list(NON_PROSE_SELECTORS))};
    var RTL_LETTER = new RegExp(${JSON.stringify(rangesToClass(STRONG_RTL_RANGES))}, 'g');
    var LTR_LETTER = new RegExp(${JSON.stringify(rangesToClass(STRONG_LTR_RANGES))}, 'g');
    var decideDirection = (${decideDirection.toString()});
    var isSettled = (${isSettled.toString()});
    var GLYPH = '\\u21C4';
    var POLL_MS = 800;
    var SELF_DESTRUCT_MS = 3000;

    /* ------------------------------------------------------------------
       Phase 0 — runs from <head>, before <body> exists.
       ------------------------------------------------------------------ */

    var file = (location.pathname.split('/').pop() || '').toLowerCase();
    var isStandalone = file !== 'workbench.html';
    if (isStandalone) {
      HTML.classList.add(STANDALONE_CLASS);
    }

    function readStored() {
      try {
        return localStorage.getItem(STORAGE_KEY);
      }
      catch (e) {
        return null;
      }
    }

    var current = readStored() === 'true';
    if (current) {
      HTML.classList.add(ON_CLASS);
    }

    /* ------------------------------------------------------------------
       Smart direction — one decision per message, one per table
       ------------------------------------------------------------------ */

    var engine = null;
    var knownRoots = new WeakSet();
    var settled = new WeakMap();
    var prior = null;

    function countLetters(el) {
      var rtl = 0;
      var ltr = 0;
      var walker = DOC.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          if (node.nodeType === 1) {
            return node.matches(NON_PROSE_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var node;
      var found;
      while ((node = walker.nextNode())) {
        if (!node.nodeValue) { continue; }
        found = node.nodeValue.match(RTL_LETTER);
        if (found) { rtl += found.length; }
        found = node.nodeValue.match(LTR_LETTER);
        if (found) { ltr += found.length; }
      }
      return [rtl, ltr];
    }

    function judge(el, lean, isMessage) {
      var fixed = settled.get(el);
      var dir = fixed;
      if (fixed && isMessage) { prior = fixed; }
      if (!fixed) {
        var counts = countLetters(el);
        // Lean on what the element already shows; before that, on the
        // conversation (messages) or the enclosing message (tables).
        var shown = el.getAttribute(DIR_ATTR);
        dir = decideDirection(counts[0], counts[1], shown || (isMessage ? prior : lean));
        if (dir && isSettled(dir, counts[0], counts[1])) {
          settled.set(el, dir);
        }
        // The latest message with real evidence sets the conversation's lean —
        // including a short question from the user, which is the best predictor
        // of the language the reply will come back in.
        if (isMessage && dir && counts[0] + counts[1] >= 8) { prior = dir; }
      }
      if (dir && el.getAttribute(DIR_ATTR) !== dir) {
        el.setAttribute(DIR_ATTR, dir);
      }
      return dir;
    }

    function judgeMessage(root) {
      var dir = judge(root, null, true);
      var tables = root.getElementsByTagName('table');
      for (var i = 0; i < tables.length; i++) {
        judge(tables[i], dir, false);
      }
    }

    function collect(node, into) {
      if (!node || node.nodeType !== 1) { return; }
      if (node.matches(ROOT_SELECTOR)) {
        knownRoots.add(node);
        into.add(node);
      }
      if (node.firstElementChild) {
        var found = node.querySelectorAll(ROOT_SELECTOR);
        for (var i = 0; i < found.length; i++) {
          knownRoots.add(found[i]);
          into.add(found[i]);
        }
      }
    }

    function rootAbove(node) {
      var el = node && (node.nodeType === 1 ? node : node.parentElement);
      for (var depth = 0; el && depth < 64; depth++) {
        if (knownRoots.has(el)) { return el; }
        el = el.parentElement;
      }
      return null;
    }

    function onMutations(records) {
      var touched = new Set();
      for (var i = 0; i < records.length; i++) {
        var root = rootAbove(records[i].target);
        if (root) { touched.add(root); }
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          collect(added[j], touched);
        }
      }
      touched.forEach(judgeMessage);
    }

    function startEngine() {
      if (engine || MODE !== 'smart' || !DOC.body) { return; }
      var initial = new Set();
      collect(DOC.body, initial);
      initial.forEach(judgeMessage);
      engine = new MutationObserver(onMutations);
      engine.observe(DOC.body, { childList: true, subtree: true, characterData: true });
    }

    function stopEngine() {
      if (engine) {
        engine.disconnect();
        engine = null;
      }
    }

    function syncEngine() {
      if (current) { startEngine(); }
      else { stopEngine(); }
    }

    /* ------------------------------------------------------------------
       State
       ------------------------------------------------------------------ */

    function syncButton() {
      var b = DOC.getElementById(BTN_ID);
      if (b) {
        b.classList.toggle(ACTIVE_CLASS, current);
        b.setAttribute('aria-pressed', current ? 'true' : 'false');
      }
    }

    function apply(on) {
      if (on !== current) {
        current = on;
        HTML.classList.toggle(ON_CLASS, on);
        try {
          localStorage.setItem(STORAGE_KEY, on ? 'true' : 'false');
        }
        catch (e) { /* storage unavailable */ }
      }
      syncButton();
      syncEngine();
    }

    // Keeps the main window and the standalone agent window in lockstep.
    window.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEY) {
        apply(e.newValue === 'true');
      }
    });

    /* ------------------------------------------------------------------
       Status bar bridge

       The extension host owns the persisted state but cannot touch this DOM,
       so the status bar item is the channel both ways: we read its label, and
       click it to request a toggle.
       ------------------------------------------------------------------ */

    var statusEl = null;
    var statusObserver = null;
    var sawStatus = false;
    var missingSince = 0;
    var lastStatusValue = null;

    function findStatusEl() {
      var items = DOC.querySelectorAll('.statusbar-item');
      for (var i = 0; i < items.length; i++) {
        if ((items[i].textContent || '').indexOf(GLYPH) !== -1) {
          return items[i];
        }
      }
      return null;
    }

    function readStatus(el) {
      var t = el.textContent || '';
      if (t.indexOf(GLYPH + ' RTL') !== -1) { return true; }
      if (t.indexOf(GLYPH + ' LTR') !== -1) { return false; }
      return null;
    }

    function attachStatus() {
      var el = findStatusEl();
      if (el === statusEl) { return; }

      if (statusObserver) {
        statusObserver.disconnect();
        statusObserver = null;
      }
      statusEl = el;
      if (!el) { return; }

      sawStatus = true;
      missingSince = 0;

      // Adopt the label only when it says something new: VS Code may replace
      // this element on re-render, and re-reading an unchanged label would undo
      // a toggle just applied locally.
      var initial = readStatus(el);
      if (initial !== null && initial !== lastStatusValue) {
        lastStatusValue = initial;
        apply(initial);
      }

      statusObserver = new MutationObserver(function () {
        var next = readStatus(el);
        if (next !== null && next !== lastStatusValue) {
          lastStatusValue = next;
          apply(next);
        }
      });
      statusObserver.observe(el, { childList: true, subtree: true, characterData: true });
    }

    /* ------------------------------------------------------------------
       Toggle button

       Hosts render several "New Conversation" buttons, some of them hidden —
       Antigravity 2.6.0 has three — so the anchor is the first *visible* one,
       in order of how specific the hook is, and the button moves if its anchor
       stops being visible.
       ------------------------------------------------------------------ */

    var ANCHORS = [
      '[data-testid="extension-new-conversation"]',
      '[data-tooltip-id="new-conversation-tooltip"]',
      '[data-testid="new-conversation-button"]',
      '[aria-label="New Conversation"]',
      '[data-tooltip-id*="new-conversation"]',
      '[aria-label*="New Chat"]',
      '[title*="New Conversation"]'
    ];

    function isVisible(el) {
      return !!(el && el.isConnected && el.getClientRects().length > 0);
    }

    function findAnchor() {
      for (var i = 0; i < ANCHORS.length; i++) {
        var candidates = DOC.querySelectorAll(ANCHORS[i]);
        for (var j = 0; j < candidates.length; j++) {
          if (candidates[j].id !== BTN_ID && isVisible(candidates[j])) {
            return candidates[j];
          }
        }
      }
      return null;
    }

    function onToggle(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      // Optimistic: flip immediately so the click feels instant...
      apply(!current);

      // ...then let the extension host record the authoritative state.
      var el = statusEl || findStatusEl();
      if (el) {
        var target = el.querySelector('a, .statusbar-item-label') || el;
        target.click();
      }
    }

    function createButton(anchor) {
      var btn = DOC.createElement('div');
      btn.id = BTN_ID;
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', 'Toggle RTL / LTR');
      btn.title = 'Toggle RTL / LTR (RTL Agents)';
      btn.textContent = GLYPH;

      // Borrow the sibling's styling so the button looks native.
      var cls = typeof anchor.className === 'string' ? anchor.className : '';
      btn.className = cls.replace(/cursor-not-allowed|!?opacity-\\d+/g, '').trim();

      btn.addEventListener('click', onToggle);
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { onToggle(e); }
      });
      return btn;
    }

    var hostObserver = null;

    function watchHost(host) {
      if (hostObserver) { hostObserver.disconnect(); }
      // childList on the header container only — it does not mutate while text streams.
      hostObserver = new MutationObserver(function () {
        var b = DOC.getElementById(BTN_ID);
        if (!b || !b.isConnected) { ensureButton(); }
      });
      hostObserver.observe(host, { childList: true });
    }

    function ensureButton() {
      var btn = DOC.getElementById(BTN_ID);
      if (isVisible(btn)) { return; }

      var anchor = findAnchor();
      if (!anchor || !anchor.parentNode) { return; }

      if (!btn) { btn = createButton(anchor); }
      anchor.parentNode.insertBefore(btn, anchor.nextSibling);
      syncButton();
      watchHost(anchor.parentNode);
    }

    /* ------------------------------------------------------------------
       Diagnostics — run window.__rtlAgents.diagnose() in DevTools
       ------------------------------------------------------------------ */

    function describe(el) {
      if (!el) { return null; }
      return {
        tag: el.tagName.toLowerCase(),
        testId: el.getAttribute('data-testid'),
        tooltipId: el.getAttribute('data-tooltip-id'),
        ariaLabel: el.getAttribute('aria-label'),
        visible: isVisible(el)
      };
    }

    function diagnose() {
      var roots = DOC.querySelectorAll(ROOT_SELECTOR);
      var samples = [];
      for (var i = 0; i < roots.length && samples.length < 6; i++) {
        var style = getComputedStyle(roots[i]);
        samples.push({
          decided: roots[i].getAttribute(DIR_ATTR),
          settled: settled.get(roots[i]) || null,
          direction: style.direction,
          textAlign: style.textAlign,
          text: (roots[i].textContent || '').replace(/\\s+/g, ' ').slice(0, 48)
        });
      }
      var probe = getComputedStyle(HTML).getPropertyValue('--rtl-agents-version').trim();
      return {
        version: VERSION,
        mode: MODE,
        active: current,
        window: isStandalone ? 'agent' : 'main',
        stylesheet: probe ? probe.replace(/"/g, '') : 'NOT LOADED',
        htmlClass: HTML.className,
        storedState: readStored(),
        statusBarItem: statusEl ? (statusEl.textContent || '').trim() : null,
        anchor: describe(findAnchor()),
        button: describe(DOC.getElementById(BTN_ID)),
        engine: engine ? 'observing' : 'idle',
        conversationPrior: prior,
        messageRoots: roots.length,
        samples: samples
      };
    }

    window.__rtlAgents = {
      version: VERSION,
      mode: MODE,
      diagnose: diagnose,
      enable: function () { apply(true); return diagnose(); },
      disable: function () { apply(false); return diagnose(); },
      toggle: function () { onToggle(); return current; }
    };

    /* ------------------------------------------------------------------
       Teardown

       When the extension is deactivated or uninstalled its status bar item
       disappears. That is the signal to remove the button and stand down.
       ------------------------------------------------------------------ */

    var pollTimer = null;

    function selfDestruct() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (statusObserver) { statusObserver.disconnect(); statusObserver = null; }
      if (hostObserver) { hostObserver.disconnect(); hostObserver = null; }
      stopEngine();

      var b = DOC.getElementById(BTN_ID);
      if (b && b.parentNode) { b.parentNode.removeChild(b); }

      HTML.classList.remove(ON_CLASS);
      HTML.classList.remove(STANDALONE_CLASS);
      try {
        localStorage.removeItem(STORAGE_KEY);
      }
      catch (e) { /* storage unavailable */ }
      try {
        delete window.__rtlAgents;
      }
      catch (e) { /* non-configurable */ }
    }

    function tick() {
      // Attached in every window rather than gated on the file name: a window
      // without a status bar simply finds nothing, and teardown only arms once
      // an item has been seen. Gating on the name would silently disable the
      // bridge the day the host renames its main shell.
      if (!statusEl || !statusEl.isConnected) { attachStatus(); }

      if (sawStatus && !statusEl) {
        if (!missingSince) {
          missingSince = Date.now();
        }
        else if (Date.now() - missingSince > SELF_DESTRUCT_MS) {
          selfDestruct();
          return;
        }
      }
      else {
        missingSince = 0;
      }
      ensureButton();
    }

    function start() {
      syncEngine();
      tick();
      pollTimer = setInterval(tick, POLL_MS);
    }

    if (DOC.readyState === 'loading') {
      DOC.addEventListener('DOMContentLoaded', start);
    }
    else {
      start();
    }
  }
  catch (e) {
    // Never break the workbench boot sequence.
    if (typeof console !== 'undefined' && console.error) {
      console.error('[RTL Agents]', e);
    }
  }
})();
/* === RTL-AGENTS-JS-END === */
`
}

/**
 * Strip every generation of injected markup from a workbench HTML document.
 * Used both when unpatching and before re-patching, so the recovered text is
 * byte-identical to the IDE's original file.
 */
export function stripInjected(html: string): string {
  return html
    // v2 sentinel block, including the newline it introduced on both sides
    .replace(/\r?\n?[ \t]*<!-- RTL-AGENTS-BEGIN -->[\s\S]*?<!-- RTL-AGENTS-END -->[ \t]*\r?\n?/g, '')
    // v1 markup, exactly as it was written
    .replace(/\r?\n\t<!-- RTL Agents Support -->\r?\n\t<link[^>]*rtl-agents\.css[^>]*>/g, '')
    .replace(/\t<!-- RTL Agents Support -->\r?\n\t<script[^>]*rtl-agents\.js[^>]*><\/script>\r?\n/g, '')
    // defensive sweep for anything left behind
    .replace(/\r?\n?[ \t]*<!-- RTL Agents Support -->/g, '')
    .replace(/\r?\n?[ \t]*<link[^>]*rtl-agents\.css[^>]*>/g, '')
    .replace(/\r?\n?[ \t]*<script[^>]*rtl-agents\.js[^>]*><\/script>/g, '')
}

/**
 * Whether a workbench HTML document currently carries the patch.
 */
export function hasPatch(html: string): boolean {
  return html.includes(PATCH_BEGIN) || html.includes(CSS_FILENAME)
}

/**
 * Build the block injected into `<head>`.
 *
 * The script is loaded synchronously from `<head>` on purpose: it must set the
 * root class before `<body>` renders. An inline script is not an option — the
 * workbench CSP allows `script-src 'self'` but not `'unsafe-inline'`.
 */
export function buildInjection(relativeCssPath: string, relativeJsPath: string): string {
  return `\n\t${PATCH_BEGIN}\n`
    + `\t<link rel="stylesheet" href="${relativeCssPath}">\n`
    + `\t<script src="${relativeJsPath}"></script>\n`
    + `\t${PATCH_END}\n`
}
