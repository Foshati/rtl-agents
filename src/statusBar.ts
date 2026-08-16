import type { RtlStatus } from './types'
import * as vscode from 'vscode'
import { TOGGLE_GLYPH } from './content'
import { findIdeInstallations } from './finder'
import { getStatus } from './injector'

let statusBarItem: vscode.StatusBarItem | undefined

/**
 * Initialize and show the status bar item.
 *
 * This item doubles as the bridge to the injected script: the script reads its
 * label to learn the current state and clicks it to request a toggle, so the
 * glyph and the `RTL`/`LTR` suffixes are part of the contract.
 */
export function createStatusBarItem(): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(
    'rtl-agents.toggle',
    vscode.StatusBarAlignment.Right,
    100,
  )
  statusBarItem.name = 'RTL Agents'
  statusBarItem.command = 'rtl-agents.toggle'
  statusBarItem.accessibilityInformation = { label: 'RTL Agents Toggle', role: 'button' }
  statusBarItem.text = `${TOGGLE_GLYPH} LTR`
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
    statusBarItem.text = `${TOGGLE_GLYPH} RTL: N/A`
    statusBarItem.color = undefined
    statusBarItem.tooltip = 'Active IDE installation could not be detected'
    return
  }

  const statuses = await getStatus(installations)
  const isPatchInstalled = statuses.some((s: RtlStatus) => s.isInstalled)

  if (!isPatchInstalled) {
    statusBarItem.text = `${TOGGLE_GLYPH} LTR`
    statusBarItem.color = undefined
    statusBarItem.tooltip = 'RTL Agents: Not patched. Click to patch.'
    return
  }

  const partial = statuses.some(s => s.patchedTargets < s.totalTargets)
  const suffix = partial ? ' (partial)' : ''

  if (layoutActive ?? false) {
    statusBarItem.text = `${TOGGLE_GLYPH} RTL`
    statusBarItem.color = '#ff9f0a'
    statusBarItem.tooltip = `RTL Agents is active. Click to switch to LTR.${suffix}`
  }
  else {
    statusBarItem.text = `${TOGGLE_GLYPH} LTR`
    statusBarItem.color = undefined
    statusBarItem.tooltip = `RTL Agents is inactive. Click to switch to RTL.${suffix}`
  }
}

/**
 * Dispose the status bar item.
 *
 * Its disappearance is the signal the injected script watches for to remove its
 * own button, so this must run whenever the extension shuts down.
 */
export function disposeStatusBar(): void {
  if (statusBarItem) {
    statusBarItem.dispose()
    statusBarItem = undefined
  }
}
