import type { ExtensionContext, StatusBarItem } from 'vscode'
import * as path from 'node:path'
import { commands, extensions, StatusBarAlignment, window, workspace } from 'vscode'

// State
let statusBarItem: StatusBarItem
let isRTL = false

// CSS Filename
const CSS_FILE = 'antigravity-rtl-always.css'

export function activate(context: ExtensionContext) {
  try {
    // 1. Create Status Bar Item (Priority 100 to be visible)
    statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 100)
    statusBarItem.command = 'rtl-agents.toggle'
    context.subscriptions.push(statusBarItem)

    // 2. Register Commands
    const toggleCmd = commands.registerCommand('rtl-agents.toggle', () => toggleRTL(context))
    context.subscriptions.push(toggleCmd)

    // 3. Initialize State
    const currentMode = workspace.getConfiguration('rtl-agents').get<string>('mode', 'auto')
    isRTL = currentMode === 'rtl'
    
    // 4. Update UI
    updateStatusBar()
    
    // 5. Show it
    statusBarItem.show()
    
    // 6. Apply initial style if needed
    if (isRTL) {
      applyRTL(context, true)
    }

    // console.log('RTL Agents activated successfully')
  }
  catch (error) {
    console.error('Failed to activate RTL Agents:', error)
    window.showErrorMessage('RTL Agents failed to activate.')
  }
}

export function deactivate() {
  // Clean up
}

async function toggleRTL(context: ExtensionContext) {
  isRTL = !isRTL
  
  // Save state
  await workspace.getConfiguration('rtl-agents').update('mode', isRTL ? 'rtl' : 'ltr', true)
  
  // Update UI
  updateStatusBar()
  
  // Apply Logic
  await applyRTL(context, isRTL)
}

function updateStatusBar() {
  if (isRTL) {
    statusBarItem.text = '$(arrow-left) RTL'
    statusBarItem.backgroundColor = undefined
    statusBarItem.tooltip = 'RTL Mode Active - Click to disable'
  }
  else {
    statusBarItem.text = '$(arrow-right) LTR'
    statusBarItem.backgroundColor = undefined
    statusBarItem.tooltip = 'LTR Mode Active - Click to enable RTL'
  }
}

async function applyRTL(context: ExtensionContext, enable: boolean) {
  // Check for APC extension
  const apcExtension = extensions.getExtension('drcika.apc-extension')
  
  if (!apcExtension) {
    // Only warn once per session or if user clicks
    const action = await window.showWarningMessage(
      'To verify RTL styles, "Apc Customize UI++" extension is required. Install it?',
      'Install Now',
      'Ignore'
    )
    if (action === 'Install Now') {
      commands.executeCommand('workbench.extensions.installExtension', 'drcika.apc-extension')
    }
    return
  }

  const apcConfig = workspace.getConfiguration('apc')
  
  if (enable) {
    // Absolute path to our CSS
    const cssPath = path.join(context.extensionPath, 'css', CSS_FILE)
    await apcConfig.update('iframe.style', cssPath, true)
    window.setStatusBarMessage('RTL Styles Applied', 3000)
  } else {
    // Remove style
    await apcConfig.update('iframe.style', undefined, true)
    window.setStatusBarMessage('RTL Styles Removed', 3000)
  }
  
  // Optional: Prompt reload if needed (APC usually needs reload for first time injection)
  // But often updating settings triggers a repaint. Let's see.
}
