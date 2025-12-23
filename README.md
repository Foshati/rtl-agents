# RTL Agents

<p align="center">
  <img src="public/icon.png" alt="RTL Agents Logo" width="128" height="128">
</p>

<p align="center">
  <b>RTL/LTR support for AI Agent panels - No external dependencies!</b>
</p>

---

## ⚡ Quick Setup (One Command!)

1. Install **RTL Agents** from the marketplace
2. Press `Cmd/Ctrl+Shift+P` → Type **"RTL Agents: Inject CSS"** → Press Enter
3. Click **"Reload Now"** when prompted
4. Done! 🎉

> ⚠️ **Note:** You'll need to re-inject after VS Code/Antigravity updates.

---

## 🎮 How to Use

### Status Bar Toggle
After installation, you'll see a toggle button in the **status bar** (bottom right):
- `⬅️ Auto` | `⬅️ RTL` | `➡️ LTR`
- Click to cycle through modes

### Keyboard Shortcut
| Shortcut | Action |
|----------|--------|
| `Ctrl+Cmd+R` (Mac) | Toggle RTL/LTR mode |
| `Ctrl+Alt+R` (Windows/Linux) | Toggle RTL/LTR mode |

### Command Palette
Press `Cmd/Ctrl+Shift+P` and type:
| Command | Description |
|---------|-------------|
| `RTL Agents: Inject CSS` | Enable RTL support (one-time setup) |
| `RTL Agents: Remove CSS` | Disable RTL support |
| `RTL Agents: Toggle Mode` | Switch between Auto/RTL/LTR |
| `RTL Agents: Set RTL` | Force RTL mode |
| `RTL Agents: Set LTR` | Force LTR mode |
| `RTL Agents: Set Auto` | Auto-detect mode |

---

## ✨ Features

- ✅ **No external dependencies** - Works standalone!
- ✅ **Auto RTL Detection** - Persian, Arabic, Hebrew text automatically RTL
- ✅ **Code Block Protection** - Code blocks always stay LTR
- ✅ **Status Bar Toggle** - Quick switch between modes
- ✅ **Keyboard Shortcuts** - Fast mode switching
- ✅ **Persistent Settings** - Mode preference saved across sessions

## 🎯 Supported Platforms

| Platform | Status |
|----------|--------|
| **Antigravity** | ✅ Fully Supported |
| **VS Code** | ✅ Supported |
| **Cursor** | ✅ Supported |

## 🌍 Supported Languages

- Persian (فارسی)
- Arabic (العربية)
- Hebrew (עברית)
- Urdu (اردو)

## 🔧 Troubleshooting

**Status bar not showing?**
- Reload window: `Cmd/Ctrl+Shift+P` → "Developer: Reload Window"

**RTL not working?**
- Run `RTL Agents: Inject CSS` command
- Reload window after injection

**After VS Code update, RTL stopped working?**
- Run `RTL Agents: Inject CSS` again

**Want to disable RTL?**
- Run `RTL Agents: Remove CSS` command

## 📄 License

MIT © [Foshati](https://github.com/Foshati)
