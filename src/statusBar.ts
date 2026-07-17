import type { RtlStatus } from './types'
import * as vscode from 'vscode'
import { findIdeInstallations } from './finder'
import { getStatus } from './injector'

let statusBarItem: vscode.StatusBarItem | undefined

/**
 * Initialize and show the status bar item.
 */
export function createStatusBarItem(): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  )
  statusBarItem.command = 'rtl-agents.toggle'
  statusBarItem.show()
  return statusBarItem
}

/**
 * Update the status bar UI according to the current installation and layout active state.
 */
export async function updateStatusBar(layoutActive?: boolean): Promise<void> {
  if (!statusBarItem) {
    return
  }

  const installations = await findIdeInstallations()

  if (installations.length === 0) {
    statusBarItem.text = '⇄ RTL: N/A'
    statusBarItem.color = undefined
    statusBarItem.tooltip = 'Active IDE installation could not be detected'
    return
  }

  const statuses = await getStatus(installations)
  const isPatchInstalled = statuses.some((s: RtlStatus) => s.isInstalled)

  if (!isPatchInstalled) {
    statusBarItem.text = '⇄ LTR'
    statusBarItem.color = undefined
    statusBarItem.tooltip = 'RTL Agents: Not patched. Click to patch.'
  }
  else {
    const active = layoutActive ?? false
    if (active) {
      statusBarItem.text = '⇄ RTL'
      statusBarItem.color = '#ff9f0a'
      statusBarItem.tooltip = 'RTL Agents is active. Click to switch to LTR.'
    }
    else {
      statusBarItem.text = '⇄ LTR'
      statusBarItem.color = undefined
      statusBarItem.tooltip = 'RTL Agents is inactive. Click to switch to RTL.'
    }
  }
}

/**
 * Dispose the status bar item.
 */
export function disposeStatusBar(): void {
  if (statusBarItem) {
    statusBarItem.dispose()
    statusBarItem = undefined
  }
}
