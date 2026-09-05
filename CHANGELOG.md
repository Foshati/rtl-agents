# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.1] - 2026-09-05

### Fixed
- **List numbers and bullets still sat on the left after 2.1.0.** Pinning `direction: rtl` moves the `::marker`, but the host indents lists with a *physical* property — Antigravity compiles `[&_ol]:pl-10` and `[&>ol]:!pl-4` to `padding-left`, which does not follow `direction`. The indent stayed on the left and the marker, now on the right, had no room to sit in. The physical padding is zeroed and the indent restored with `padding-inline-start`; task lists keep their zero indent, having no marker to make room for.
- **Blockquote bar on the wrong side.** Antigravity draws it with an inline `borderLeft`. Cleared and redrawn with `border-inline-start`; a stylesheet `!important` outranks an inline style.
- **Manifest kept reporting the version that first applied the patch.** Extension updates rewrite the assets through `reinjectAssets` without touching workbench HTML, and only `addRtl` wrote the manifest — so `rtl-agents.manifest.json` said `2.0.0` beside a `2.1.0` stylesheet. The version is now refreshed whenever assets are reinjected.

### Testing
- Seven tests cover the physical-property fixes and the manifest refresh, each mutation-tested. One of them computes real CSS specificity — with the `:is()`/`:not()` rule that a functional pseudo-class counts as its most specific argument, not the sum — and checks that *every* selector in the group outranks the host's `(0,2,1)` `!important` rule. The first version of that test counted class names in the string, passed on a deliberately weakened selector, and was thrown out.

### Note
Under `baseDirection: "auto"` lists stay left-to-right, so these fixes apply only when the base is pinned.

## [2.1.0] - 2026-09-05

### Fixed
- **Persian sentences opening with a Latin term rendered left-to-right.** `unicode-bidi: plaintext` resolves a paragraph's direction from its first strong directional character (Unicode BiDi P2/P3). In Persian technical prose sentences constantly open with one — `API لایه…`, `OTP ارسال‌شده…`, `npm install را…`, `PostgreSQL با…` — and every such paragraph flipped entirely to LTR: left-aligned, with its trailing Persian period or colon stranded on the wrong side. Measured against a representative 30-line corpus, 12 lines (40%) misfired. Message text is now pinned to an RTL base instead of detected.
- **List markers and indentation sat on the left of right-aligned text.** The stylesheet set `unicode-bidi` and `text-align` but never `direction`, and a `::marker` is placed according to the list item's `direction` while the UA indent resolves against the list's. `ul` and `ol` now carry the base direction along with `li`.
- **Inline `<code>` was force-aligned.** `text-align: left` applied to every LTR-guarded selector including inline code, fighting the alignment of the paragraph containing it. Alignment is now pinned only on block-level code containers; inline code keeps `direction: ltr` with `unicode-bidi: isolate`, which is what preserves its order.

### Added
- **`rtl-agents.baseDirection`** — `rtl` (default) pins message text to a right-to-left base; `auto` restores per-paragraph first-strong resolution for chats that are mostly left-to-right. Changing it rewrites the stylesheet immediately.
- The composer (`textarea`, `contenteditable`) keeps per-paragraph resolution in both modes, so it still flips live as you type.
- A 30-line Persian corpus in `test/corpus.ts` with a first-strong detector, cross-checked against a Unicode BiDi reference implementation (agrees on all 30 lines). Seven new tests guard the base direction, list handling, inline-code alignment, composer behaviour and the `auto` opt-in; each was mutation-tested to confirm it actually fails when the corresponding rule is reverted.

### Note
Pinning the base costs one thing: an all-English paragraph is right-aligned, with its word order untouched. That is how LTR passages sit in an RTL document, and `baseDirection: "auto"` restores the old behaviour for anyone who prefers it.

## [2.0.0] - 2026-08-16

Rewrite of the injection layer. Fixes [#25](https://github.com/Foshati/rtl-agents/issues/25).

### Fixed
- **Antigravity 2.5.5 support**: response text stopped aligning because the targeted class combination no longer exists. Antigravity now renders every response paragraph as `div.animate-markdown` with one `<span>` per streamed word; the old `.leading-relaxed.select-text > p` selectors matched nothing.
- **Toggle button did nothing**: the injected button used `href="command:rtl-agents.toggle"`. The `command:` scheme only resolves inside webviews and trusted markdown, never from a plain anchor in the workbench, so no click ever reached the extension. It now toggles locally and clicks the status bar item to notify the extension host.
- **Status bar never synced**: the runtime looked for `.status-bar-item`; the real VS Code class is `.statusbar-item`. State was read back as `null` every time, leaving the extension and the DOM permanently out of step.
- **The button could not be removed**: disabling or uninstalling the extension left the button in the header with nothing behind it. The runtime now watches for the status bar item disappearing and tears itself down.
- **Antigravity's separate agent window** (`workbench-jetski-agent.html`) was never patched, so RTL never applied there.
- **Stale backups could corrupt an updated IDE**: `workbench.html.bak` from an older build could be restored over a newer one. Backups are now hash-verified against the running build, restores are reconstructed from the live file, and mismatched backups are discarded instead of applied.
- **`product.json` restore** no longer copies the whole backup over a possibly-updated file; only the checksum keys we removed are put back, byte-identically when nothing else changed.
- **Settings did nothing**: `customSelectors` was declared but the CSS/JS were hard-coded constants. It now shapes the generated stylesheet, applied as soon as the setting changes.

### Changed
- **Direction is now pure CSS** (`unicode-bidi: plaintext` + `text-align: start`). The browser resolves direction per paragraph from the first strong directional character — the same decision the old regex made, but at layout time. This removes the visible left-to-right jump while a reply streams, and removes the per-word JavaScript that caused it.
- **No document-wide `MutationObserver`**. Streaming a reply used to fire the observer on every word, each time re-running `querySelectorAll` and serialising `textContent` across the whole chat. The runtime now watches only the status bar item and the chat header container.
- The injected `<script>` is loaded from `<head>` so the root class is set before the first paint. It is an external file, not inline — the workbench CSP allows `script-src 'self'` but not `'unsafe-inline'`.
- Injected markup is wrapped in `<!-- RTL-AGENTS-BEGIN/END -->` sentinels, making removal exact. v1 markup is still recognised and cleaned up on upgrade.
- **First run no longer patches the IDE unannounced** — it asks first.
- Added `pnpm test`, covering the patch/unpatch round trip, idempotency, checksum handling, stale-backup recovery, v1 cleanup, and asset generation.

### Deprecated
- `rtl-agents.rtlCharacterRegex` is ignored; native BiDi resolution replaces it.

## [1.8.0] - 2026-07-17

### Added
- **Showcase Screenshot**: Embedded a high-quality demonstration screenshot showing the RTL Agents extension layout in the README.
- **Enhanced Documentation**: Restructured the README layout with improved formatting, tables, and typography for a professional look.

## [1.7.9] - 2026-07-17

### Fixed
- **Precise Toggle Button Injection**: Restructured the target selector search in \`tryInsertButton\` to exclusively target chat conversation actions (e.g. next to the \`+\` button in Antigravity or Cursor), preventing the button from being mistakenly rendered inside generic sidebar/explorer headers.

## [1.7.8] - 2026-07-17

### Added
- **Resilient Workflow**: Added \`continue-on-error: true\` for the Open VSX publishing step to ensure the pipeline succeeds even if the version is already published manually or if the registry is experiencing downtime.

## [1.7.7] - 2026-07-17

### Added
- **Proven Real-Time Toggling Logic**: Re-designed the layout status sync mechanism to match the proven, reliable logic of `antigravity-chat-rtl-extension-main`. Clicking either the status bar item or the header button toggles the RTL layout instantly without requiring VS Code window reloads.
- **Synchronized Status Bar state**: Real-time synchronization of active layout states using a status bar DOM observer inside `workbench.html`.

## [1.7.6] - 2026-07-17

### Added
- **Instant Toggling**: Replaced status bar confirmation popups with immediate activation/deactivation.
- **Improved Status Bar UI**: Replaced generic text with a clean `⇄ RTL` (active, orange color) and `⇄ LTR` (inactive) status indicator.
- **Active Orange Accent Color**: The injected `⇄` header button and status bar item turn vibrant orange when active.
- **Dynamic Path Finding Fallback**: Automatically locates the core workbench folder relative to `workbench.html` on custom IDE builds.

## [1.7.5] - 2026-07-17

### Added
- **Multi-IDE Support**: Automatically patch Cursor, VS Code, Windsurf, VSCodium, and Antigravity IDE.
- **Smart RTL Text Detection**: Apply RTL alignment only on elements containing Hebrew, Arabic, or Persian text, keeping code blocks, tables, and system components in LTR.
- **Header Toggle Button**: Native UI toggle button injected directly into panel headers.
- **Local Storage State Persistence**: Remember LTR/RTL button toggle state across window reloads.
- **product.json Checksum Stripping**: Prevent "Unsupported/Corrupted installation" warnings from being displayed by the editor.
- **Automated macOS Permissions Repair Helper**: Copy the `chown` command in one click if permission is denied.
- **Custom configurations**: User-defined CSS selectors and character regex.

## [1.1.0] - 2025-12-23

### Fixed
- Configuration prefix mismatch (`rtl-agent` → `rtl-agents`)

### Added
- `antigravity-rtl.css` for direct CSS injection in Antigravity

## [1.0.0] - 2025-12-23

### Added

- 🎉 Initial release
- 🔄 Auto-detection mode for RTL languages (Persian, Arabic, Hebrew, Urdu)
- 📝 Manual RTL/LTR toggle modes
- ⚡ Streaming text optimization for AI agent responses
- 🎨 Customizable font family, size, and line height
- 🔧 Status bar indicator with mode display
- ⌨️ Keyboard shortcut (`Ctrl+Alt+R` / `Ctrl+Cmd+R`) for quick toggle
- 📦 CSS injection for agent panels, chat views, and markdown content
- 🌍 Support for bidirectional text mixing

### Features

- **Language Detection**: Intelligent detection of RTL characters in text
- **Code Block Handling**: Code blocks remain LTR even in RTL context
- **Streaming Support**: Proper rendering during AI text streaming
- **Configurable Targets**: Custom CSS selectors for targeting specific elements
