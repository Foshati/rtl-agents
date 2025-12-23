# RTL Agents

<p align="center">
  <img src="public/icon.png" alt="RTL Agents Logo" width="128" height="128">
</p>

<p align="center">
  <b>RTL/LTR support for AI Agent panels in VS Code, Cursor, and Antigravity</b>
</p>

---

## ⚡ Quick Setup

### Step 1: Install Extensions

1. Install **RTL Agents** from the marketplace
2. Install **[Apc Customize UI++](https://marketplace.visualstudio.com/items?itemName=drcika.apc-extension)**

### Step 2: Add CSS Path to Settings

Open `settings.json` (Cmd/Ctrl+Shift+P → "Preferences: Open Settings (JSON)") and add:

```json
{
  "apc.iframe.style": "~/.vscode/extensions/foshati.rtl-agents-1.3.7/src/agents-style/antigravity-rtl.css"
}
```

> 💡 **Tip:** Find the exact extension version by running:
> ```bash
> ls ~/.vscode/extensions/ | grep rtl-agents
> ```

### Step 3: Reload Window

Press `Cmd/Ctrl+Shift+P` → "Developer: Reload Window"

---

## 🎮 How to Use

### Status Bar Toggle
After installation, you'll see a toggle button in the **status bar** (bottom right):
- Click to cycle through modes: **Auto** → **RTL** → **LTR** → **Auto**

### Keyboard Shortcut
| Shortcut | Action |
|----------|--------|
| `Ctrl+Cmd+R` (Mac) | Toggle RTL/LTR mode |
| `Ctrl+Alt+R` (Windows/Linux) | Toggle RTL/LTR mode |

### Command Palette
Press `Cmd/Ctrl+Shift+P` and type:
- `RTL Agents: Toggle Mode`
- `RTL Agents: Set RTL`
- `RTL Agents: Set LTR`
- `RTL Agents: Set Auto`

### Settings
Configure default mode in settings:
```json
{
  "rtl-agents.mode": "auto"
}
```
Options: `"auto"` | `"rtl"` | `"ltr"`

---

## ✨ Features

- **Auto RTL Detection**: Persian, Arabic, Hebrew text automatically displays RTL
- **Code Block Protection**: Code blocks always stay LTR
- **Status Bar Toggle**: Quick switch between modes
- **Keyboard Shortcuts**: Fast mode switching
- **Persistent Settings**: Mode preference saved across sessions

## 🎯 Supported Platforms

| Platform | Status |
|----------|--------|
| **Antigravity** | ✅ Fully Supported |
| **VS Code** | ✅ Supported |
| **Cursor** | ✅ Supported |
| GitHub Copilot | 🔜 Roadmap |
| Cody | 🔜 Roadmap |
| Continue | 🔜 Roadmap |

## 🌍 Supported Languages

- Persian (فارسی)
- Arabic (العربية)
- Hebrew (עברית)
- Urdu (اردو)

## 🔧 Troubleshooting

**Status bar not showing?**
- Make sure extension is enabled
- Try reloading window: `Cmd/Ctrl+Shift+P` → "Developer: Reload Window"

**RTL not working in Agent panels?**
- Ensure `apc.iframe.style` path is correct in `settings.json`
- Verify Apc extension is installed and enabled
- Reload window after changes

## 📄 License

MIT © [Foshati](https://github.com/Foshati)
