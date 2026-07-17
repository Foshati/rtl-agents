import type { RtlMode } from './types'
import * as vscode from 'vscode'
import { findIdeInstallations } from './finder'
import { addRtl, getStatus, isFullyInstalled, reinjectAssets, removeRtl } from './injector'
import { createStatusBarItem, disposeStatusBar, updateStatusBar } from './statusBar'

const STATE_MODE_KEY = 'rtl-agents.mode'
const STATE_VERSION_KEY = 'rtl-agents.version'

let outputChannel: vscode.OutputChannel | undefined
let globalState: vscode.Memento
let currentVersion: string

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('RTL Agents')
  }
  return outputChannel
}

async function saveMode(mode: RtlMode): Promise<void> {
  await globalState.update(STATE_MODE_KEY, mode)
}

function getSavedMode(): RtlMode {
  return globalState.get<RtlMode>(STATE_MODE_KEY, 'inactive')
}

/**
 * Prompt macOS/Windows permissions error helper.
 */
async function showPermissionError(workbenchPath: string): Promise<void> {
  const isMac = vscode.env.appHost === 'desktop' && workbenchPath.includes('.app/')
  if (isMac) {
    const appMatch = workbenchPath.match(/\/[^/]+\.app\//)
    const appPath = appMatch
      ? workbenchPath.substring(0, appMatch.index! + appMatch[0].length - 1)
      : '/Applications/Cursor.app' // Fallback

    const cmd = `sudo chown -R $(whoami) "${appPath}"`
    const action = await vscode.window.showErrorMessage(
      'RTL Agents: Permission denied. This is common on macOS. Run a quick command to fix permissions.',
      'Copy Fix Command',
    )
    if (action === 'Copy Fix Command') {
      await vscode.env.clipboard.writeText(cmd)
      vscode.window.showInformationMessage('Command copied! Paste it in your Terminal, then fully close and reopen the IDE.')
    }
  }
  else {
    vscode.window.showErrorMessage(
      'RTL Agents: Permission DENIED. Try running your IDE as Administrator.',
    )
  }
}

/**
 * Ask to restart the editor to load workbench modifications.
 */
async function promptRestartIfChanged(changed: boolean): Promise<void> {
  if (!changed) {
    return
  }
  await updateStatusBar()
  const action = await vscode.window.showInformationMessage(
    'RTL Agents: Patch applied! Changes will take effect after restarting the IDE.',
    'Restart Now',
    'Later',
  )
  if (action === 'Restart Now') {
    await vscode.commands.executeCommand('workbench.action.quit')
  }
}

async function handleAdd(): Promise<void> {
  const installations = await findIdeInstallations()
  if (installations.length === 0) {
    vscode.window.showWarningMessage('Could not locate active IDE installation files.')
    return
  }

  const channel = getOutputChannel()
  channel.clear()
  channel.appendLine('Activating RTL Agents support...\n')

  let anyChanged = false
  let anyPermissionError = false

  for (const inst of installations) {
    channel.appendLine(`[${inst.ideName}]`)
    const result = await addRtl(inst)
    result.messages.forEach(m => channel.appendLine(m))
    channel.appendLine('')
    if (result.changed)
      anyChanged = true
    if (result.permissionError)
      anyPermissionError = true
  }

  channel.show(true)
  await saveMode('active')

  if (anyPermissionError) {
    await showPermissionError(installations[0].workbenchHtmlPath)
  }
  else {
    await promptRestartIfChanged(anyChanged)
    if (!anyChanged) {
      vscode.window.showInformationMessage('RTL Agents is already active.')
    }
  }
}

async function handleRemove(): Promise<void> {
  const installations = await findIdeInstallations()
  if (installations.length === 0) {
    vscode.window.showWarningMessage('Could not locate active IDE installation files.')
    return
  }

  const channel = getOutputChannel()
  channel.clear()
  channel.appendLine('Deactivating RTL Agents support...\n')

  let anyChanged = false

  for (const inst of installations) {
    channel.appendLine(`[${inst.ideName}]`)
    const result = await removeRtl(inst)
    result.messages.forEach(m => channel.appendLine(m))
    channel.appendLine('')
    if (result.changed)
      anyChanged = true
  }

  channel.show(true)
  await saveMode('inactive')
  await promptRestartIfChanged(anyChanged)

  if (!anyChanged) {
    vscode.window.showInformationMessage('RTL Agents is already inactive.')
  }
}

async function handleStatus(): Promise<void> {
  const installations = await findIdeInstallations()
  if (installations.length === 0) {
    vscode.window.showWarningMessage('Could not locate active IDE installation files.')
    return
  }

  const statuses = await getStatus(installations)
  const channel = getOutputChannel()
  channel.clear()

  const ideName = vscode.env.appName
  channel.appendLine(`Current IDE: ${ideName}`)
  channel.appendLine(`Saved Mode: ${getSavedMode()}`)
  channel.appendLine(`Found ${installations.length} IDE installation(s):\n`)

  for (const s of statuses) {
    channel.appendLine(`  [${s.installation.ideName}]`)
    channel.appendLine(`    RTL Patched: ${s.isInstalled ? 'YES' : 'NO'}`)
    channel.appendLine(`    Backup HTML: ${s.htmlBackupExists ? 'workbench.html.bak exists' : 'No backup'}`)
    channel.appendLine(`    Backup Product: ${s.productBackupExists ? 'product.json.bak exists' : 'No backup'}`)
    channel.appendLine(`    Path:        ${s.installation.workbenchHtmlPath}\n`)
  }

  channel.show(true)
  await updateStatusBar()
}

async function handleToggle(): Promise<void> {
  const installations = await findIdeInstallations()
  if (installations.length === 0) {
    vscode.window.showWarningMessage('Could not locate active IDE installation files.')
    return
  }

  const statuses = await getStatus(installations)
  const isOn = statuses.some(s => s.isInstalled)

  if (isOn) {
    await vscode.commands.executeCommand('rtl-agents.remove')
  }
  else {
    await vscode.commands.executeCommand('rtl-agents.add')
  }
}

async function handleRestart(): Promise<void> {
  const installations = await findIdeInstallations()
  if (installations.length === 0) {
    vscode.window.showWarningMessage('Could not locate active IDE installation files.')
    return
  }

  const channel = getOutputChannel()
  channel.clear()
  channel.appendLine('Restarting and re-injecting RTL Agents support...\n')

  let anyChanged = false
  let anyPermissionError = false

  channel.appendLine('--- 1. Restoring original files ---')
  for (const inst of installations) {
    const result = await removeRtl(inst)
    result.messages.forEach(m => channel.appendLine(m))
    if (result.changed)
      anyChanged = true
  }

  channel.appendLine('\n--- 2. Re-applying patch ---')
  for (const inst of installations) {
    const result = await addRtl(inst)
    result.messages.forEach(m => channel.appendLine(m))
    if (result.changed)
      anyChanged = true
    if (result.permissionError)
      anyPermissionError = true
  }

  channel.show(true)
  await saveMode('active')

  if (anyPermissionError) {
    await showPermissionError(installations[0].workbenchHtmlPath)
  }
  else {
    await promptRestartIfChanged(anyChanged)
  }
}

async function saveVersion(): Promise<void> {
  await globalState.update(STATE_VERSION_KEY, currentVersion)
}

async function silentInject(): Promise<boolean> {
  const installations = await findIdeInstallations()
  let anyChanged = false
  for (const inst of installations) {
    const result = await addRtl(inst)
    if (result.changed)
      anyChanged = true
    if (result.permissionError) {
      await showPermissionError(inst.workbenchHtmlPath)
    }
  }
  return anyChanged
}

async function silentReinjectVersion(): Promise<boolean> {
  const installations = await findIdeInstallations()
  let anyChanged = false
  for (const inst of installations) {
    const installed = await isFullyInstalled(inst)
    if (!installed) {
      const result = await addRtl(inst)
      if (result.changed)
        anyChanged = true
      if (result.permissionError) {
        await showPermissionError(inst.workbenchHtmlPath)
      }
    }
    else {
      const result = await reinjectAssets(inst)
      if (result.changed)
        anyChanged = true
      if (result.permissionError) {
        await showPermissionError(inst.workbenchHtmlPath)
      }
    }
  }
  return anyChanged
}

/**
 * Handle auto-reactivation after IDE upgrades or asset refreshing on extension upgrades.
 */
async function autoReactivate(): Promise<void> {
  const savedVersion = globalState.get<string>(STATE_VERSION_KEY)
  const savedMode = getSavedMode()

  // If first run, set version, trigger initial installation instructions
  if (!savedVersion) {
    await saveVersion()
    await handleAdd()
    return
  }

  if (savedMode !== 'active') {
    if (savedVersion !== currentVersion) {
      await saveVersion()
    }
    return
  }

  // Extension updated: reinject new code/CSS content silently
  if (savedVersion !== currentVersion) {
    await saveVersion()
    const changed = await silentReinjectVersion()
    await promptRestartIfChanged(changed)
    return
  }

  // Check if IDE updated and overwrote the patched workbench.html
  const installations = await findIdeInstallations()
  if (installations.length === 0) {
    return
  }

  let needsFull = false
  for (const inst of installations) {
    if (!(await isFullyInstalled(inst))) {
      needsFull = true
      break
    }
  }

  if (needsFull) {
    const changed = await silentInject()
    await promptRestartIfChanged(changed)
  }
}

export function activate(context: vscode.ExtensionContext): void {
  globalState = context.globalState
  currentVersion = context.extension.packageJSON.version ?? '1.0.0'

  const explained = globalState.get<boolean>('rtl-agents.usageExplained')
  if (!explained) {
    void globalState.update('rtl-agents.usageExplained', true)
    const ch = getOutputChannel()
    ch.appendLine('========================================')
    ch.appendLine('RTL Agents Extension Activated!')
    ch.appendLine('========================================')
    ch.appendLine('This extension patches the editor\'s workbench files on disk (workbench.html + local CSS/JS assets).')
    ch.appendLine('To begin, run: Command Palette (Ctrl+Shift+P / Cmd+Shift+P) -> "RTL Agents: Activate RTL".')
    ch.appendLine('Then quit the IDE fully (not just reloading window) and restart to apply changes.')
    ch.appendLine('')
  }

  const statusBar = createStatusBarItem()
  context.subscriptions.push(statusBar)

  context.subscriptions.push(
    vscode.commands.registerCommand('rtl-agents.add', handleAdd),
    vscode.commands.registerCommand('rtl-agents.remove', handleRemove),
    vscode.commands.registerCommand('rtl-agents.status', handleStatus),
    vscode.commands.registerCommand('rtl-agents.toggle', handleToggle),
    vscode.commands.registerCommand('rtl-agents.restart', handleRestart),

    // Automatically monitor configuration edits (e.g. custom selectors, custom regex) and re-patch on the fly
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('rtl-agents')) {
        await updateStatusBar()
        if (getSavedMode() === 'active') {
          const installations = await findIdeInstallations()
          for (const inst of installations) {
            await reinjectAssets(inst)
          }
        }
      }
    }),
  )

  // Run startup re-patch check
  autoReactivate().catch((err) => {
    getOutputChannel().appendLine(`Auto-reactivate error: ${err}`)
  })
  updateStatusBar().catch((err) => {
    getOutputChannel().appendLine(`Status bar error: ${err}`)
  })
}

export function deactivate(): void {
  disposeStatusBar()
  if (outputChannel) {
    outputChannel.dispose()
  }
}
