import * as path from 'node:path'
import type { ExtensionContext, StatusBarItem } from 'vscode'
import { commands, extensions, StatusBarAlignment, window, workspace } from 'vscode'

// State
let statusBarItem: StatusBarItem
let isRTL = false

// CSS Filename - Targeting #cascade
const CSS_FILE = 'antigravity-rtl.css'

export function activate(context: ExtensionContext) {
  try {
    // 1. Create Status Bar Item (Priority 100 to be high prominence)
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
    
    // 5. Show it IMMEDIATELY
    statusBarItem.show()

    // 6. Apply initial style if needed
    if (isRTL) {
      applyRTL(context, true).catch(console.error)
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
  
  // Update UI first for immediate feedback
  updateStatusBar()
  
  // Apply Logic
  await applyRTL(context, isRTL)
}

function updateStatusBar() {
  if (isRTL) {
    statusBarItem.text = '$(arrow-left) RTL'
    statusBarItem.tooltip = 'RTL Mode Active (Click to switch to LTR)'
    statusBarItem.backgroundColor = undefined // Standard color
  }
  else {
    statusBarItem.text = '$(arrow-right) LTR'
    statusBarItem.tooltip = 'LTR Mode Active (Click to switch to RTL)'
    statusBarItem.backgroundColor = undefined
  }
}

async function applyRTL(context: ExtensionContext, enable: boolean) {
  // Check for APC extension gracefully
  const apcExtension = extensions.getExtension('drcika.apc-extension')
  
  if (!apcExtension) {
    // Only warn if user is trying to enable RTL
    if (enable) {
      const action = await window.showWarningMessage(
        'To apply RTL styles to Antigravity, the "Apc Customize UI++" extension is required.',
        'Install Now',
      )
      if (action === 'Install Now') {
        commands.executeCommand('workbench.extensions.installExtension', 'drcika.apc-extension')
      }
    }
    return
  }

  const apcConfig = workspace.getConfiguration('apc')
  
  // Use the correct CSS file path
  const cssPath = path.join(context.extensionPath, 'src', 'agents-style', CSS_FILE)
  
  if (enable) {
    await apcConfig.update('iframe.style', cssPath, true)
  }
  else {
    await apcConfig.update('iframe.style', undefined, true)
  }
}
