import type { ExtensionContext, StatusBarItem } from 'vscode'
import { commands, StatusBarAlignment, window, workspace } from 'vscode'

type Mode = 'auto' | 'rtl' | 'ltr'

let statusBarItem: StatusBarItem | undefined

// Get current mode from settings
function getMode(): Mode {
  return workspace.getConfiguration('rtl-agents').get('mode', 'auto')
}

// Set mode in settings
async function setMode(mode: Mode): Promise<void> {
  await workspace.getConfiguration('rtl-agents').update('mode', mode, true)
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

// Cycle through modes: auto -> rtl -> ltr -> auto
async function toggleMode(): Promise<void> {
  const current = getMode()
  const next: Record<Mode, Mode> = {
    auto: 'rtl',
    rtl: 'ltr',
    ltr: 'auto',
  }
  await setMode(next[current])
  updateStatusBar()
  window.showInformationMessage(`RTL Agents: ${next[current].toUpperCase()} mode`)
}

export function activate(context: ExtensionContext): void {
  // Create status bar item
  statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 100)
  statusBarItem.command = 'rtl-agents.toggle'
  updateStatusBar()
  statusBarItem.show()

  // Register commands
  context.subscriptions.push(
    commands.registerCommand('rtl-agents.toggle', toggleMode),
    commands.registerCommand('rtl-agents.setRTL', () => setMode('rtl')),
    commands.registerCommand('rtl-agents.setLTR', () => setMode('ltr')),
    commands.registerCommand('rtl-agents.setAuto', () => setMode('auto')),
    statusBarItem,
  )

  // Listen to config changes
  context.subscriptions.push(
    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('rtl-agents'))
        updateStatusBar()
    }),
  )

  // RTL Agents activated
}

export function deactivate(): void {
  statusBarItem?.dispose()
}
