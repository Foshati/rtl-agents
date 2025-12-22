# RTL Agents

<p align="center">
  <img src="public/icon.png" alt="RTL Agent Logo" width="128" height="128">
</p>

<p align="center">
  <b>Enhance RTL/LTR text rendering in VS Code Agent panels</b>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=Foshati.rtl-agents">
    <img src="https://img.shields.io/visual-studio-marketplace/v/Foshati.rtl-agents?style=flat-square&color=blue" alt="Version">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=Foshati.rtl-agents">
    <img src="https://img.shields.io/visual-studio-marketplace/i/Foshati.rtl-agents?style=flat-square&color=green" alt="Installs">
  </a>
  <a href="https://github.com/Foshati/rtl-agents/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/Foshati/rtl-agents?style=flat-square" alt="License">
  </a>
</p>

---

## ✨ Features

- **🔄 Auto-Detection**: Automatically detects RTL languages (Persian, Arabic, Hebrew, Urdu)
- **📝 Bidirectional Support**: Seamless LTR/RTL text mixing in agent conversations
- **⚡ Streaming Optimized**: Properly renders text as it streams from AI models
- **🎨 Customizable**: Configure fonts, directions, and styling to your preference
- **🔧 Zero Config**: Works out of the box with sensible defaults

## 📦 Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "RTL Agent"
4. Click Install

### From Open VSX

1. Visit [Open VSX - RTL Agent](https://open-vsx.org/extension/Foshati/rtl-agents)
2. Click Install

## 🚀 Usage

### Quick Toggle

Use the keyboard shortcut to quickly toggle between modes:

- **Windows/Linux**: `Ctrl+Alt+R`
- **macOS**: `Ctrl+Cmd+R`

### Commands

Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for:

| Command | Description |
|---------|-------------|
| `RTL Agent: Toggle RTL/LTR Mode` | Cycle through Auto → RTL → LTR modes |
| `RTL Agent: Enable RTL Mode` | Force RTL direction |
| `RTL Agent: Disable RTL Mode` | Disable the extension |
| `RTL Agent: Set Auto-Detection Mode` | Enable automatic language detection |

### Status Bar

The status bar shows the current mode:
- 🔄 **Auto** - Automatic language detection (orange)
- ⬅️ **RTL** - Right-to-Left mode (blue)
- ➡️ **LTR** - Left-to-Right mode (green)

Click the status bar item to toggle between modes.

## ⚙️ Configuration

Open Settings (`Ctrl+,` / `Cmd+,`) and search for "RTL Agent":

| Setting | Default | Description |
|---------|---------|-------------|
| `rtl-agents.enabled` | `true` | Enable/disable the extension |
| `rtl-agents.mode` | `"auto"` | Direction mode: `auto`, `rtl`, or `ltr` |
| `rtl-agents.fontFamily` | `""` | Custom font (e.g., `Vazirmatn`, `IRANSansX`) |
| `rtl-agents.fontSize` | `0` | Custom font size (0 = default) |
| `rtl-agents.lineHeight` | `1.6` | Line height for better readability |
| `rtl-agents.statusBar.enabled` | `true` | Show status bar indicator |
| `rtl-agents.statusBar.alignment` | `"right"` | Status bar position |

### Recommended Fonts

For the best Persian/Arabic experience, install one of these fonts:

- [**Vazirmatn**](https://github.com/rastikerdar/vazirmatn) - Modern Persian font
- [**IRANSansX**](https://github.com/AyhanMohammadi/IRANSansXV2) - Professional Iranian font
- **Tahoma** - Built-in Windows font with RTL support

## 🌍 Supported Languages

| Language | Code | Direction |
|----------|------|-----------|
| Persian (Farsi) | `fa` | RTL |
| Arabic | `ar` | RTL |
| Hebrew | `he` | RTL |
| Urdu | `ur` | RTL |
| Pashto | `ps` | RTL |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Thanks to everyone who contributed to making RTL support better in VS Code
- Special thanks to the Persian and Arabic developer communities

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Foshati">Foshati</a>
</p>
