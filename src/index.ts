import type { ExtensionContext, StatusBarItem } from 'vscode'
import * as path from 'node:path'
import { commands, extensions, StatusBarAlignment, window, workspace } from 'vscode'

type Mode = 'auto' | 'rtl' | 'ltr'

let statusBarItem: StatusBarItem | undefined
let extensionPath: string = ''

// CSS file name bundled with extension
const RTL_CSS_FILE = 'antigravity-rtl-always.css'

// Get current mode from settings
function getMode(): Mode {
  return workspace.getConfiguration('rtl-agents').get('mode', 'auto')
}

// Set mode in settings
async function setMode(mode: Mode): Promise<void> {
  await workspace.getConfiguration('rtl-agents').update('mode', mode, true)
}

// Check if Apc extension is installed
function isApcInstalled(): boolean {
  return extensions.getExtension('drcika.apc-extension') !== undefined
}

// Get the CSS file path
function getCssPath(): string {
  return path.join(extensionPath, 'css', RTL_CSS_FILE)
}

// Update Apc iframe style setting
async function updateApcStyle(enable: boolean): Promise<void> {
  const config = workspace.getConfiguration('apc')
  if (enable) {
    const cssPath = getCssPath()
    await config.update('iframe.style', cssPath, true)
  }
  else {
    await config.update('iframe.style', undefined, true)
  }
}

// Update status bar display
function updateStatusBar(): void {
  if (!statusBarItem)
    return

  const mode = getMode()
  const icons: Record<Mode, string> = {
    auto: '$(symbol-misc)',
    rtl: '$(arrow-left)',
    ltr: '$(arrow-right)',
  }
  const labels: Record<Mode, string> = {
    auto: 'Auto',
    rtl: 'RTL',
    ltr: 'LTR',
  }

  statusBarItem.text = `${icons[mode]} ${labels[mode]}`
  statusBarItem.tooltip = `RTL Agents: ${labels[mode]} mode\nClick to toggle`
}

// Apply RTL mode based on current setting
async function applyMode(mode: Mode): Promise<void> {
  if (!isApcInstalled()) {
    const install = await window.showWarningMessage(
      'RTL Agents requires "Apc Customize UI++" extension to work. Install it now?',
      'Install',
      'Later',
    )
    if (install === 'Install') {
      commands.executeCommand('workbench.extensions.installExtension', 'drcika.apc-extension')
    }
    return
  }

  switch (mode) {
    case 'rtl':
      await updateApcStyle(true)
      break
    case 'ltr':
      await updateApcStyle(false)
      break
    case 'auto':
      // Auto mode: Keep current state or detect from content
      // For now, we'll disable RTL in auto mode
      await updateApcStyle(false)
      break
  }
}

// Cycle through modes: auto -> rtl -> ltr -> auto
async function toggleMode(): Promise<void> {
  const current = getMode()
  const next: Record<Mode, Mode> = {
    auto: 'rtl',
    rtl: 'ltr',
    ltr: 'auto',
  }
  const newMode = next[current]
  await setMode(newMode)
  await applyMode(newMode)
  updateStatusBar()

  const modeLabels: Record<Mode, string> = {
    rtl: 'RTL (Right-to-Left)',
    ltr: 'LTR (Left-to-Right)',
    auto: 'Auto',
  }
  window.showInformationMessage(`RTL Agents: ${modeLabels[newMode]}`)
}

// Set specific mode
async function setSpecificMode(mode: Mode): Promise<void> {
  await setMode(mode)
  await applyMode(mode)
  updateStatusBar()
}

// Show reload prompt
async function promptReload(): Promise<void> {
  const reload = await window.showInformationMessage(
    'RTL Agents: Reload window to apply changes?',
    'Reload',
    'Later',
  )
  if (reload === 'Reload') {
    commands.executeCommand('workbench.action.reloadWindow')
  }
}

export function activate(context: ExtensionContext): void {
  // Store extension path for CSS file access
  extensionPath = context.extensionPath

  // Create status bar item
  statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 100)
  statusBarItem.command = 'rtl-agents.toggle'
  updateStatusBar()
  statusBarItem.show()

  // Register commands
  context.subscriptions.push(
    commands.registerCommand('rtl-agents.toggle', toggleMode),
    commands.registerCommand('rtl-agents.setRTL', async () => {
      await setSpecificMode('rtl')
      await promptReload()
    }),
    commands.registerCommand('rtl-agents.setLTR', async () => {
      await setSpecificMode('ltr')
      await promptReload()
    }),
    commands.registerCommand('rtl-agents.setAuto', async () => {
      await setSpecificMode('auto')
      await promptReload()
    }),
    statusBarItem,
  )

  // Listen to config changes
  context.subscriptions.push(
    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('rtl-agents'))
        updateStatusBar()
    }),
  )

  // Apply initial mode on activation
  const initialMode = getMode()
  if (initialMode === 'rtl') {
    applyMode(initialMode)
  }
}

export function deactivate(): void {
  statusBarItem?.dispose()
}
