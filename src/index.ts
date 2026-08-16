import type { ContentOptions, PatchOptions, RtlMode } from './types'
import * as vscode from 'vscode'
import { findIdeInstallations } from './finder'
import { addRtl, getStatus, isFullyInstalled, reinjectAssets, removeRtl } from './injector'
import { createStatusBarItem, disposeStatusBar, updateStatusBar } from './statusBar'

const STATE_MODE_KEY = 'rtl-agents.mode'
const STATE_VERSION_KEY = 'rtl-agents.version'
const STATE_LAYOUT_ACTIVE_KEY = 'rtl-agents.layoutActive'
const STATE_PROMPTED_KEY = 'rtl-agents.firstRunPrompted'

let outputChannel: vscode.OutputChannel | undefined
let globalState: vscode.Memento
let currentVersion: string
let globalLayoutActive = false

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('RTL Agents')
  }
  return outputChannel
}

function getContentOptions(): ContentOptions {
  const config = vscode.workspace.getConfiguration('rtl-agents')
  const custom = config.get<string[]>('customSelectors', [])
  return {
    customSelectors: custom.map(s => s.trim()).filter(Boolean),
  }
}

function getPatchOptions(): PatchOptions {
  return { ...getContentOptions(), extensionVersion: currentVersion }
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
  await updateStatusBar(globalLayoutActive)
  const action = await vscode.window.showInformationMessage(
    'RTL Agents: Patch applied. Fully quit and reopen the IDE to load it (a window reload is not enough).',
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

  const options = getPatchOptions()
  let anyChanged = false
  let anyPermissionError = false

  for (const inst of installations) {
    channel.appendLine(`[${inst.ideName}] ${inst.targets.length} workbench document(s)`)
    const result = await addRtl(inst, options)
    result.messages.forEach(m => channel.appendLine(m))
    channel.appendLine('')
    if (result.changed) {
      anyChanged = true
    }
    if (result.permissionError) {
      anyPermissionError = true
    }
  }

  channel.show(true)
  await saveMode('active')

  if (anyPermissionError) {
    await showPermissionError(installations[0].workbenchHtmlPath)
    return
  }

  await promptRestartIfChanged(anyChanged)
  if (!anyChanged) {
    vscode.window.showInformationMessage('RTL Agents is already active.')
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
  let anyPermissionError = false

  for (const inst of installations) {
    channel.appendLine(`[${inst.ideName}]`)
    const result = await removeRtl(inst)
    result.messages.forEach(m => channel.appendLine(m))
    channel.appendLine('')
    if (result.changed) {
      anyChanged = true
    }
    if (result.permissionError) {
      anyPermissionError = true
    }
  }

  channel.show(true)
  await saveMode('inactive')
  globalLayoutActive = false
  await globalState.update(STATE_LAYOUT_ACTIVE_KEY, false)
  await updateStatusBar(false)

  if (anyPermissionError) {
    await showPermissionError(installations[0].workbenchHtmlPath)
    return
  }

  if (anyChanged) {
    vscode.window.showInformationMessage(
      'RTL Agents removed. The toggle button disappears right away; quit and reopen the IDE to unload the patch completely.',
    )
  }
  else {
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

  channel.appendLine(`Current IDE:  ${vscode.env.appName}`)
  channel.appendLine(`Extension:    v${currentVersion}`)
  channel.appendLine(`Saved Mode:   ${getSavedMode()}`)
  channel.appendLine(`Layout:       ${globalLayoutActive ? 'RTL' : 'LTR'}`)
  channel.appendLine(`Found ${installations.length} IDE installation(s):\n`)

  for (const s of statuses) {
    channel.appendLine(`  [${s.installation.ideName}]`)
    channel.appendLine(`    RTL Patched:   ${s.patchedTargets}/${s.totalTargets} workbench document(s)`)
    channel.appendLine(`    Backup HTML:   ${s.htmlBackupExists ? 'present' : 'none'}`)
    channel.appendLine(`    Backup Product:${s.productBackupExists ? ' present' : ' none'}`)
    channel.appendLine(`    Asset dir:     ${s.installation.workbenchDir}`)
    for (const target of s.installation.targets) {
      channel.appendLine(`      - ${target.label}  ->  ${target.htmlPath}`)
    }
    channel.appendLine('')
  }

  channel.show(true)
  await updateStatusBar(globalLayoutActive)
}

async function handleToggle(): Promise<void> {
  const installations = await findIdeInstallations()
  if (installations.length === 0) {
    vscode.window.showWarningMessage('Could not locate active IDE installation files.')
    return
  }

  const statuses = await getStatus(installations)
  if (!statuses.some(s => s.isInstalled)) {
    await vscode.commands.executeCommand('rtl-agents.add')
    return
  }

  globalLayoutActive = !globalLayoutActive
  await globalState.update(STATE_LAYOUT_ACTIVE_KEY, globalLayoutActive)
  await updateStatusBar(globalLayoutActive)
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

  const options = getPatchOptions()
  let anyChanged = false
  let anyPermissionError = false

  channel.appendLine('--- 1. Restoring original files ---')
  for (const inst of installations) {
    const result = await removeRtl(inst)
    result.messages.forEach(m => channel.appendLine(m))
    if (result.changed) {
      anyChanged = true
    }
  }

  channel.appendLine('\n--- 2. Re-applying patch ---')
  for (const inst of installations) {
    const result = await addRtl(inst, options)
    result.messages.forEach(m => channel.appendLine(m))
    if (result.changed) {
      anyChanged = true
    }
    if (result.permissionError) {
      anyPermissionError = true
    }
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

async function silentPatch(onlyWhenIncomplete: boolean): Promise<boolean> {
  const installations = await findIdeInstallations()
  const options = getPatchOptions()
  let anyChanged = false

  for (const inst of installations) {
    if (onlyWhenIncomplete && (await isFullyInstalled(inst))) {
      const refreshed = await reinjectAssets(inst, getContentOptions())
      if (refreshed.changed) {
        anyChanged = true
      }
      continue
    }

    const result = await addRtl(inst, options)
    if (result.changed) {
      anyChanged = true
    }
    if (result.permissionError) {
      await showPermissionError(inst.workbenchHtmlPath)
    }
  }

  return anyChanged
}

/**
 * Offer to patch on first run instead of modifying the IDE unannounced.
 */
async function promptFirstRun(): Promise<void> {
  await globalState.update(STATE_PROMPTED_KEY, true)
  await saveVersion()

  const action = await vscode.window.showInformationMessage(
    'RTL Agents can enable right-to-left chat text in this IDE. It patches the editor\'s workbench files on disk and can be undone at any time.',
    'Activate',
    'Not Now',
  )
  if (action === 'Activate') {
    await handleAdd()
  }
}

/**
 * Handle auto-reactivation after IDE upgrades or asset refreshing on extension upgrades.
 */
async function autoReactivate(): Promise<void> {
  const prompted = globalState.get<boolean>(STATE_PROMPTED_KEY, false)
  const savedVersion = globalState.get<string>(STATE_VERSION_KEY)

  if (!prompted && !savedVersion) {
    await promptFirstRun()
    return
  }

  if (getSavedMode() !== 'active') {
    if (savedVersion !== currentVersion) {
      await saveVersion()
    }
    return
  }

  // Extension updated: rewrite the assets with the current generation of code.
  if (savedVersion !== currentVersion) {
    await saveVersion()
    await promptRestartIfChanged(await silentPatch(true))
    return
  }

  // IDE updated and overwrote the patched workbench documents.
  const installations = await findIdeInstallations()
  if (installations.length === 0) {
    return
  }

  for (const inst of installations) {
    if (!(await isFullyInstalled(inst))) {
      await promptRestartIfChanged(await silentPatch(false))
      return
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  globalState = context.globalState
  currentVersion = context.extension.packageJSON.version ?? '2.0.0'
  globalLayoutActive = globalState.get<boolean>(STATE_LAYOUT_ACTIVE_KEY, false)

  const statusBar = createStatusBarItem()
  context.subscriptions.push(statusBar)

  context.subscriptions.push(
    vscode.commands.registerCommand('rtl-agents.add', handleAdd),
    vscode.commands.registerCommand('rtl-agents.remove', handleRemove),
    vscode.commands.registerCommand('rtl-agents.status', handleStatus),
    vscode.commands.registerCommand('rtl-agents.toggle', handleToggle),
    vscode.commands.registerCommand('rtl-agents.restart', handleRestart),

    // Rewrite the assets when the user edits custom selectors.
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration('rtl-agents')) {
        return
      }
      await updateStatusBar(globalLayoutActive)
      if (getSavedMode() !== 'active') {
        return
      }
      const installations = await findIdeInstallations()
      const options = getContentOptions()
      for (const inst of installations) {
        await reinjectAssets(inst, options)
      }
    }),
  )

  autoReactivate().catch((err) => {
    getOutputChannel().appendLine(`Auto-reactivate error: ${err}`)
  })
  updateStatusBar(globalLayoutActive).catch((err) => {
    getOutputChannel().appendLine(`Status bar error: ${err}`)
  })
}

export function deactivate(): void {
  // Disposing the status bar item is also the signal the injected script watches
  // for: once it disappears, the script removes its button and stands down.
  disposeStatusBar()
  if (outputChannel) {
    outputChannel.dispose()
  }
}
