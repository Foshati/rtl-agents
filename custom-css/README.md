# RTL Agent - Custom CSS

این فایل CSS برای استفاده با افزونه **Custom CSS and JS Loader** طراحی شده است.

## 📦 نصب

### ۱. نصب Custom CSS and JS Loader
```
ext install be5invis.vscode-custom-css
```

### ۲. تنظیمات VS Code
فایل `settings.json` را باز کنید و اضافه کنید:

```json
{
  "vscode_custom_css.imports": [
    "file:///Users/YOUR_USERNAME/.vscode/extensions/rtl-agent.css"
  ]
}
```

### ۳. کپی فایل CSS
فایل `rtl-agent.css` را در مسیر بالا کپی کنید.

### ۴. اعمال تغییرات
1. Command Palette را باز کنید (`Cmd+Shift+P`)
2. دستور `Reload Custom CSS and JS` را اجرا کنید
3. VS Code را ری‌استارت کنید

## 🎨 ویژگی‌ها

- ✅ پشتیبانی از متن‌های فارسی/عربی/عبری
- ✅ تشخیص خودکار جهت متن
- ✅ بهینه‌سازی برای streaming
- ✅ کدها همیشه LTR
- ✅ فونت مناسب RTL
