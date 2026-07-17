import * as vscode from 'vscode'
import type { RtlStatus } from './types'
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
 * Update the status bar UI according to the current installation state.
 */
export async function updateStatusBar(): Promise<void> {
  if (!statusBarItem) {
    return
  }

  const installations = await findIdeInstallations()

  if (installations.length === 0) {
    statusBarItem.text = '$(globe) RTL Agents: N/A'
    statusBarItem.tooltip = 'Active IDE installation could not be detected'
    return
  }

  const statuses = await getStatus(installations)
  const anyInstalled = statuses.some((s: RtlStatus) => s.isInstalled)

  if (anyInstalled) {
    statusBarItem.text = '$(globe) RTL Agents: On'
    statusBarItem.tooltip = 'RTL Agents support is injected and active. Click to toggle.'
  }
  else {
    statusBarItem.text = '$(globe) RTL Agents: Off'
    statusBarItem.tooltip = 'RTL Agents support is inactive. Click to toggle.'
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
