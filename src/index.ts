import type { ExtensionContext, StatusBarItem } from 'vscode'
import { commands, StatusBarAlignment, window, workspace } from 'vscode'
import { RTLStyleInjector } from './style-injector'

type DirectionMode = 'auto' | 'rtl' | 'ltr'

let statusBarItem: StatusBarItem | undefined
let styleInjector: RTLStyleInjector | undefined

/**
 * Get configuration value
 */
function getConfig<T>(key: string, defaultValue: T): T {
  const config = workspace.getConfiguration('rtl-agents')
  return config.get<T>(key, defaultValue)
}

/**
 * Update configuration value
 */
async function setConfig<T>(key: string, value: T): Promise<void> {
  const config = workspace.getConfiguration('rtl-agents')
  await config.update(key, value, true)
}

/**
 * Check if extension is enabled
 */
function isEnabled(): boolean {
  return getConfig<boolean>('enabled', true)
}

/**
 * Get current direction mode
 */
function getMode(): DirectionMode {
  return getConfig<DirectionMode>('mode', 'auto')
}

/**
 * Get status bar alignment from configuration
 */
function getAlignment(): StatusBarAlignment {
  const alignment = getConfig<string>('statusBar.alignment', 'right')
  return alignment === 'left' ? StatusBarAlignment.Left : StatusBarAlignment.Right
}

/**
 * Get status bar priority from configuration
 */
function getPriority(): number {
  return getConfig<number>('statusBar.priority', 100)
}

/**
 * Check if status bar is enabled
 */
function isStatusBarEnabled(): boolean {
  return getConfig<boolean>('statusBar.enabled', true)
}

/**
 * Update status bar display
 */
function updateStatusBar(): void {
  if (!statusBarItem)
    return

  const enabled = isEnabled()
  const mode = getMode()

  if (!enabled) {
    statusBarItem.text = '$(circle-slash) RTL Off'
    statusBarItem.tooltip = 'RTL Agent: Disabled (click to enable)'
    statusBarItem.color = '#808080'
  }
  else {
    const modeIcons: Record<DirectionMode, string> = {
      auto: '$(sync)',
      rtl: '$(arrow-left)',
      ltr: '$(arrow-right)',
    }

    const modeLabels: Record<DirectionMode, string> = {
      auto: 'Auto',
      rtl: 'RTL',
      ltr: 'LTR',
    }

    statusBarItem.text = `${modeIcons[mode]} ${modeLabels[mode]}`
    statusBarItem.tooltip = `RTL Agent: ${modeLabels[mode]} Mode (click to toggle)`
    statusBarItem.color = mode === 'rtl' ? '#4FC3F7' : mode === 'ltr' ? '#81C784' : '#FFB74D'
  }
}

/**
 * Apply RTL styles based on current settings
 */
function applyStyles(): void {
  if (!styleInjector)
    return

  const enabled = isEnabled()
  const mode = getMode()

  if (!enabled) {
    styleInjector.removeStyles()
    return
  }

  const customFont = getConfig<string>('fontFamily', '')
  const fontSize = getConfig<number>('fontSize', 0)
  const lineHeight = getConfig<number>('lineHeight', 1.6)
  const targets = getConfig<string[]>('targets', [])

  styleInjector.applyStyles({
    mode,
    fontFamily: customFont,
    fontSize,
    lineHeight,
    targets,
  })
}

/**
 * Enable RTL mode
 */
async function enableRTL(): Promise<void> {
  await setConfig('enabled', true)
  await setConfig('mode', 'rtl')
  applyStyles()
  updateStatusBar()
  window.showInformationMessage('RTL Agent: RTL mode enabled')
}

/**
 * Disable RTL mode
 */
async function disableRTL(): Promise<void> {
  await setConfig('enabled', false)
  applyStyles()
  updateStatusBar()
  window.showInformationMessage('RTL Agent: Disabled')
}

/**
 * Toggle between modes: auto -> rtl -> ltr -> auto
 */
async function toggleMode(): Promise<void> {
  const enabled = isEnabled()
  const currentMode = getMode()

  if (!enabled) {
    await setConfig('enabled', true)
    await setConfig('mode', 'auto')
  }
  else {
    const modes: DirectionMode[] = ['auto', 'rtl', 'ltr']
    const currentIndex = modes.indexOf(currentMode)
    const nextMode = modes[(currentIndex + 1) % modes.length]
    await setConfig('mode', nextMode)
  }

  applyStyles()
  updateStatusBar()

  const mode = getMode()
  const modeLabels: Record<DirectionMode, string> = {
    auto: 'Auto-Detection',
    rtl: 'RTL (Right-to-Left)',
    ltr: 'LTR (Left-to-Right)',
  }
  window.showInformationMessage(`RTL Agent: ${modeLabels[mode]}`)
}

/**
 * Set auto-detection mode
 */
async function setAutoMode(): Promise<void> {
  await setConfig('enabled', true)
  await setConfig('mode', 'auto')
  applyStyles()
  updateStatusBar()
  window.showInformationMessage('RTL Agent: Auto-detection mode enabled')
}

/**
 * Activate extension
 */
export function activate(context: ExtensionContext): void {
  // Initialize style injector
  styleInjector = new RTLStyleInjector()

  // Register commands
  context.subscriptions.push(
    commands.registerCommand('rtl-agents.enable', enableRTL),
    commands.registerCommand('rtl-agents.disable', disableRTL),
    commands.registerCommand('rtl-agents.toggle', toggleMode),
    commands.registerCommand('rtl-agents.setAuto', setAutoMode),
  )

  // Create status bar item if enabled
  if (isStatusBarEnabled()) {
    statusBarItem = window.createStatusBarItem(getAlignment(), getPriority())
    statusBarItem.command = 'rtl-agents.toggle'
    updateStatusBar()
    statusBarItem.show()
    context.subscriptions.push(statusBarItem)
  }

  // Listen to configuration changes
  context.subscriptions.push(
    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('rtl-agents')) {
        applyStyles()
        updateStatusBar()
      }
    }),
  )

  // Apply initial styles
  applyStyles()

  console.warn('RTL Agent activated')
}

/**
 * Deactivate extension
 */
export function deactivate(): void {
  if (styleInjector) {
    styleInjector.removeStyles()
    styleInjector = undefined
  }
  statusBarItem = undefined
  console.warn('RTL Agent deactivated')
}
