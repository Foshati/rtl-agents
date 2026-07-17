# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
