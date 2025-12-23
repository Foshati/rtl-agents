import type { ExtensionContext, StatusBarItem } from 'vscode'
import { commands, StatusBarAlignment, window, workspace } from 'vscode'

type Mode = 'rtl' | 'ltr'

let statusBarItem: StatusBarItem | undefined

function getMode(): Mode {
  return workspace.getConfiguration('rtl-agents').get('mode', 'rtl')
}

async function setMode(mode: Mode): Promise<void> {
  await workspace.getConfiguration('rtl-agents').update('mode', mode, true)
}

function updateStatusBar(): void {
  if (!statusBarItem) return
  
  const mode = getMode()
  statusBarItem.text = mode === 'rtl' ? '$(arrow-left) RTL' : '$(arrow-right) LTR'
  statusBarItem.tooltip = `Click to toggle (current: ${mode.toUpperCase()})`
}

async function toggle(): Promise<void> {
  const current = getMode()
  const next = current === 'rtl' ? 'ltr' : 'rtl'
  await setMode(next)
  updateStatusBar()
}

export function activate(context: ExtensionContext): void {
  statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 100)
  statusBarItem.command = 'rtl-agents.toggle'
  updateStatusBar()
  statusBarItem.show()

  context.subscriptions.push(
    commands.registerCommand('rtl-agents.toggle', toggle),
    statusBarItem,
    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('rtl-agents')) updateStatusBar()
    }),
  )
}

export function deactivate(): void {
  statusBarItem?.dispose()
}
