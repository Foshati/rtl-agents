# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
