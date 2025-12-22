# RTL Agent - Custom CSS

This CSS file is designed for use with the **Custom CSS and JS Loader** extension.

## 📦 Installation

### 1. Install Custom CSS and JS Loader
```
ext install be5invis.vscode-custom-css
```

### 2. VS Code Settings
Open `settings.json` and add:

```json
{
  "vscode_custom_css.imports": [
    "file:///Users/YOUR_USERNAME/.vscode/extensions/rtl-agent.css"
  ]
}
```

### 3. Copy CSS File
Copy `rtl-agent.css` to the path above.

### 4. Apply Changes
1. Open Command Palette (`Cmd+Shift+P`)
2. Run `Reload Custom CSS and JS`
3. Restart VS Code

## 🎨 Features

- ✅ Persian/Arabic/Hebrew text support
- ✅ Auto text direction detection
- ✅ Streaming optimization
- ✅ Code blocks always LTR
- ✅ RTL-friendly fonts
