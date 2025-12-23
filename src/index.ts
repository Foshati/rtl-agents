import type { ExtensionContext, StatusBarItem } from 'vscode'
import { commands, env, StatusBarAlignment, Uri, window, workspace } from 'vscode'
import * as fs from 'node:fs'
import * as path from 'node:path'

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

// Find workbench.html path
function getWorkbenchPath(): string | undefined {
  const appRoot = env.appRoot
  const possiblePaths = [
    path.join(appRoot, 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.html'),
    path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.html'),
    path.join(appRoot, 'out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench.html'),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p
    }
  }
  return undefined
}

// Get CSS file path in extension
function getCssPath(context: ExtensionContext): string {
  return path.join(context.extensionPath, 'src', 'agents-style', 'antigravity-rtl.css')
}

// Inject CSS into workbench
async function injectCss(context: ExtensionContext): Promise<boolean> {
  const workbenchPath = getWorkbenchPath()
  if (!workbenchPath) {
    window.showErrorMessage('RTL Agents: Could not find workbench.html')
    return false
  }

  const cssPath = getCssPath(context)
  const cssUri = Uri.file(cssPath).toString()
  const injectTag = `<!-- RTL-AGENTS-CSS --><link rel="stylesheet" href="${cssUri}"><!-- /RTL-AGENTS-CSS -->`

  try {
    let content = fs.readFileSync(workbenchPath, 'utf-8')

    // Check if already injected
    if (content.includes('RTL-AGENTS-CSS')) {
      window.showInformationMessage('RTL Agents: CSS already injected. Reload window to apply.')
      return true
    }

    // Find </head> and inject before it
    const headEnd = content.indexOf('</head>')
    if (headEnd === -1) {
      window.showErrorMessage('RTL Agents: Could not find </head> in workbench.html')
      return false
    }

    content = content.slice(0, headEnd) + injectTag + content.slice(headEnd)
    fs.writeFileSync(workbenchPath, content, 'utf-8')

    const choice = await window.showInformationMessage(
      'RTL Agents: CSS injected successfully! Reload window to apply.',
      'Reload Now'
    )
    if (choice === 'Reload Now') {
      commands.executeCommand('workbench.action.reloadWindow')
    }
    return true
  }
  catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    window.showErrorMessage(`RTL Agents: Failed to inject CSS - ${errorMessage}`)
    return false
  }
}

// Remove injected CSS
async function removeCss(): Promise<boolean> {
  const workbenchPath = getWorkbenchPath()
  if (!workbenchPath) {
    return false
  }

  try {
    let content = fs.readFileSync(workbenchPath, 'utf-8')

    // Remove injected CSS
    content = content.replace(/<!-- RTL-AGENTS-CSS -->.*?<!-- \/RTL-AGENTS-CSS -->/g, '')
    fs.writeFileSync(workbenchPath, content, 'utf-8')

    const choice = await window.showInformationMessage(
      'RTL Agents: CSS removed. Reload window to apply.',
      'Reload Now'
    )
    if (choice === 'Reload Now') {
      commands.executeCommand('workbench.action.reloadWindow')
    }
    return true
  }
  catch {
    return false
  }
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
    commands.registerCommand('rtl-agents.inject', () => injectCss(context)),
    commands.registerCommand('rtl-agents.remove', () => removeCss()),
    statusBarItem,
  )

  // Listen to config changes
  context.subscriptions.push(
    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('rtl-agents'))
        updateStatusBar()
    }),
  )

  // Show activation message with inject prompt on first install
  const hasInjected = context.globalState.get<boolean>('hasInjected', false)
  if (!hasInjected) {
    window.showInformationMessage(
      'RTL Agents: To enable RTL in Agent panels, run "RTL Agents: Inject CSS" command.',
      'Inject Now'
    ).then((choice) => {
      if (choice === 'Inject Now') {
        injectCss(context).then((success) => {
          if (success) {
            context.globalState.update('hasInjected', true)
          }
        })
      }
    })
  }
}

export function deactivate(): void {
  statusBarItem?.dispose()
}
