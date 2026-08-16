# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
