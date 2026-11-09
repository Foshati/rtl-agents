import type { StandaloneApp } from './standalone'
import type { BaseDirection, ContentOptions, PatchOptions, RtlMode } from './types'
import * as vscode from 'vscode'
import { findIdeInstallations } from './finder'
import { addRtl, assetsCurrent, getStatus, isFullyInstalled, isInstalled, reinjectAssets, removeRtl } from './injector'
import {
  findStandaloneApps,
  isStandalonePatched,
  STANDALONE_PERMISSION_HINT,
  STANDALONE_UNAPPROVED_HINT,
  standaloneCurrent,
  syncStandalone,
  unsyncStandalone,
} from './standalone'
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

/**
 * Messages are collected into arrays by the patch code; this array writes each
 * one straight to the output channel as it is pushed.
 */
function channelWriter(channel: vscode.OutputChannel): string[] {
  const lines: string[] = []
  lines.push = (...items: string[]) => {
    items.forEach(line => channel.appendLine(line))
    return items.length
  }
  return lines
}

function getContentOptions(): ContentOptions {
  const config = vscode.workspace.getConfiguration('rtl-agents')
  const custom = config.get<string[]>('customSelectors', [])
  const base = config.get<BaseDirection>('baseDirection', 'smart')
  return {
    customSelectors: custom.map(s => s.trim()).filter(Boolean),
    baseDirection: base === 'rtl' || base === 'auto' ? base : 'smart',
    extensionVersion: currentVersion,
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
 * The standalone Antigravity app, when this is the Antigravity IDE.
 *
 * The two ship together and users run both, but a Cursor or VS Code user who
 * happens to have Antigravity installed never asked for it to be modified.
 */
async function standaloneTargets(): Promise<StandaloneApp[]> {
  return /antigravity/i.test(vscode.env.appName) ? findStandaloneApps() : []
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
 * Ask to restart whatever was patched so it loads the change.
 */
async function promptRestartIfChanged(changed: boolean, standaloneChanged = false): Promise<void> {
  if (!changed && !standaloneChanged) {
    return
  }
  await updateStatusBar(globalLayoutActive)

  if (!changed) {
    vscode.window.showInformationMessage(
      'RTL Agents: Patch applied to the Antigravity app. Fully quit and reopen it to load it.',
    )
    return
  }

  const action = await vscode.window.showInformationMessage(
    standaloneChanged
      ? 'RTL Agents: Patch applied. Fully quit and reopen the IDE and the Antigravity app to load it (a window reload is not enough).'
      : 'RTL Agents: Patch applied. Fully quit and reopen the IDE to load it (a window reload is not enough).',
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
  let standaloneChanged = false

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

  const standalone = await standaloneTargets()
  if (standalone.length > 0) {
    channel.appendLine('[Antigravity app]')
    const synced = await syncStandalone(standalone, options, channelWriter(channel))
    channel.appendLine('')
    if (synced.permissionError) {
      vscode.window.showWarningMessage(`RTL Agents: ${STANDALONE_PERMISSION_HINT}`)
    }
    if (synced.blocked) {
      vscode.window.showWarningMessage(STANDALONE_UNAPPROVED_HINT)
    }
    standaloneChanged = synced.changed
  }

  channel.show(true)
  await saveMode('active')

  if (anyPermissionError) {
    await showPermissionError(installations[0].workbenchHtmlPath)
    return
  }

  await promptRestartIfChanged(anyChanged, standaloneChanged)
  if (!anyChanged && !standaloneChanged) {
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

  const standalone = await standaloneTargets()
  if (standalone.length > 0) {
    channel.appendLine('[Antigravity app]')
    const unsynced = await unsyncStandalone(standalone, channelWriter(channel))
    channel.appendLine('')
    if (unsynced.permissionError) {
      vscode.window.showWarningMessage(`RTL Agents: ${STANDALONE_PERMISSION_HINT}`)
    }
    anyChanged = anyChanged || unsynced.changed
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
    if (s.isInstalled) {
      const current = await assetsCurrent(s.installation, getPatchOptions())
      channel.appendLine(`    Assets:        ${current ? 'current' : 'STALE — run "RTL Agents: Restart RTL", then fully quit and reopen'}`)
    }
    for (const target of s.installation.targets) {
      channel.appendLine(`      - ${target.label}  ->  ${target.htmlPath}`)
    }
    channel.appendLine('')
  }

  const standalone = await standaloneTargets()
  if (standalone.length > 0) {
    channel.appendLine('Antigravity app:\n')
    for (const app of standalone) {
      const patched = await isStandalonePatched(app)
      channel.appendLine(`  [${app.name}]`)
      channel.appendLine(`    Hook:          ${patched ? 'installed' : 'not installed'}`)
      if (patched) {
        const current = await standaloneCurrent(app, getPatchOptions())
        channel.appendLine(`    Files:         ${current ? 'current' : 'STALE — run "RTL Agents: Restart RTL", then fully quit and reopen the app'}`)
      }
      channel.appendLine(`    Hook folder:   ${app.dataDir}`)
      channel.appendLine('')
    }
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

  const standalone = await standaloneTargets()
  let standaloneChanged = false

  channel.appendLine('--- 1. Restoring original files ---')
  for (const inst of installations) {
    const result = await removeRtl(inst)
    result.messages.forEach(m => channel.appendLine(m))
    if (result.changed) {
      anyChanged = true
    }
  }
  if (standalone.length > 0) {
    channel.appendLine('[Antigravity app]')
    await unsyncStandalone(standalone, channelWriter(channel))
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
  if (standalone.length > 0) {
    channel.appendLine('[Antigravity app]')
    const synced = await syncStandalone(standalone, options, channelWriter(channel))
    standaloneChanged = synced.changed
    if (synced.permissionError) {
      vscode.window.showWarningMessage(`RTL Agents: ${STANDALONE_PERMISSION_HINT}`)
    }
    if (synced.blocked) {
      vscode.window.showWarningMessage(STANDALONE_UNAPPROVED_HINT)
    }
  }

  channel.show(true)
  await saveMode('active')

  if (anyPermissionError) {
    await showPermissionError(installations[0].workbenchHtmlPath)
  }
  else {
    await promptRestartIfChanged(anyChanged, standaloneChanged)
  }
}

async function saveVersion(): Promise<void> {
  await globalState.update(STATE_VERSION_KEY, currentVersion)
}

/**
 * Bring the standalone app in line with this build, quietly.
 * Returns whether anything on disk changed.
 */
async function silentStandalone(): Promise<boolean> {
  const apps = await standaloneTargets()
  if (apps.length === 0) {
    return false
  }
  const options = getPatchOptions()
  const pending: StandaloneApp[] = []
  for (const app of apps) {
    if (!(await standaloneCurrent(app, options))) {
      pending.push(app)
    }
  }
  if (pending.length === 0) {
    return false
  }
  const messages: string[] = []
  const result = await syncStandalone(pending, options, messages)
  messages.forEach(m => getOutputChannel().appendLine(m))
  return result.changed
}

async function silentPatch(onlyWhenIncomplete: boolean): Promise<boolean> {
  const installations = await findIdeInstallations()
  const options = getPatchOptions()
  let anyChanged = false

  for (const inst of installations) {
    if (onlyWhenIncomplete && (await isFullyInstalled(inst))) {
      const refreshed = await reinjectAssets(inst, getPatchOptions())
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
    // The saved mode can be missing or stale while the patch is on disk — state
    // that did not survive a reinstall, or an activation by an older build. A
    // patch on disk means someone turned this on, and the deactivate command is
    // the only thing that removes it, so adopt it instead of leaving it to rot.
    let patchedOnDisk = false
    for (const inst of await findIdeInstallations()) {
      if (await isInstalled(inst)) {
        patchedOnDisk = true
      }
    }
    for (const app of await standaloneTargets()) {
      if (await isStandalonePatched(app)) {
        patchedOnDisk = true
      }
    }
    if (!patchedOnDisk) {
      if (savedVersion !== currentVersion) {
        await saveVersion()
      }
      return
    }
    await saveMode('active')
  }

  if (savedVersion !== currentVersion) {
    await saveVersion()
  }

  // On every start, bring the files on disk in line with this build: re-patch
  // workbench documents an IDE update overwrote, and rewrite assets that differ
  // from what this version and these settings generate. Keying this on a stored
  // version alone is not enough — the stored version can already match while the
  // assets on disk came from another build, and then nothing would ever fix them.
  // Assets are compared by content, so a start with nothing stale writes nothing.
  const ideChanged = await silentPatch(true)
  await promptRestartIfChanged(ideChanged, await silentStandalone())
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
      const options = getPatchOptions()
      for (const inst of installations) {
        await reinjectAssets(inst, options)
      }
      await silentStandalone()
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
