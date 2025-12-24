import type { ExtensionContext, StatusBarItem } from 'vscode'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { commands, env, StatusBarAlignment, window, workspace } from 'vscode'

type Mode = 'rtl' | 'ltr'

let statusBarItem: StatusBarItem | undefined

function getMode(): Mode {
  return workspace.getConfiguration('rtl-agents').get('mode', 'rtl')
}

async function setMode(mode: Mode): Promise<void> {
  await workspace.getConfiguration('rtl-agents').update('mode', mode, true)
}

function updateStatusBar(): void {
  if (!statusBarItem)
    return
  const mode = getMode()
  statusBarItem.text = mode === 'rtl' ? '$(arrow-left) RTL' : '$(arrow-right) LTR'
  statusBarItem.tooltip = `Click to toggle (current: ${mode.toUpperCase()})`
}

function getWorkbenchPath(): string | undefined {
  const appRoot = env.appRoot
  const paths = [
    path.join(appRoot, 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.html'),
    path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.html'),
  ]
  for (const p of paths) {
    if (fs.existsSync(p))
      return p
  }
  return undefined
}

function getJsContent(mode: Mode): string {
  if (mode === 'rtl') {
    return `
      (function() {
        function applyRTL() {
          const targets = ['react-app', 'chat'];
          targets.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
              el.setAttribute('dir', 'rtl');
              el.style.direction = 'rtl';
              el.style.textAlign = 'right';
            }
          });
        }
        
        // Initial apply
        applyRTL();
        document.addEventListener('DOMContentLoaded', applyRTL);

        // Robust observer
        const observer = new MutationObserver(() => applyRTL());
        observer.observe(document.body, { childList: true, subtree: true });
      })();
    `
  }
  return `
    (function() {
      function applyLTR() {
        const targets = ['react-app', 'chat'];
        targets.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.removeAttribute('dir');
            el.style.direction = '';
            el.style.textAlign = '';
          }
        });
      }
      
      applyLTR();
      document.addEventListener('DOMContentLoaded', applyLTR);
      
      const observer = new MutationObserver(() => applyLTR());
      observer.observe(document.body, { childList: true, subtree: true });
    })();
  `
}

async function applyMode(mode: Mode): Promise<void> {
  const workbenchPath = getWorkbenchPath()
  if (!workbenchPath) {
    window.showErrorMessage('RTL Agents: Could not find workbench.html')
    return
  }

  try {
    let content = fs.readFileSync(workbenchPath, 'utf-8')

    // Remove existing RTL Agents style/script
    content = content.replace(/<!-- RTL-AGENTS -->[\s\S]*?<!-- \/RTL-AGENTS -->/g, '')

    // Add new script
    const js = getJsContent(mode)
    const scriptTag = `<!-- RTL-AGENTS --><script>${js}</script><!-- /RTL-AGENTS -->`

    const headEnd = content.indexOf('</head>')
    if (headEnd !== -1) {
      content = content.slice(0, headEnd) + scriptTag + content.slice(headEnd)
      fs.writeFileSync(workbenchPath, content, 'utf-8')

      const choice = await window.showInformationMessage(
        `RTL Agents: ${mode.toUpperCase()} mode applied! Reload to see changes.`,
        'Reload Now',
      )
      if (choice === 'Reload Now') {
        commands.executeCommand('workbench.action.reloadWindow')
      }
    }
  }
  catch (err) {
    window.showErrorMessage(`RTL Agents: ${err}`)
  }
}

async function toggle(): Promise<void> {
  const current = getMode()
  const next: Mode = current === 'rtl' ? 'ltr' : 'rtl'
  await setMode(next)
  updateStatusBar()
  await applyMode(next)
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
      if (e.affectsConfiguration('rtl-agents'))
        updateStatusBar()
    }),
  )
}

export function deactivate(): void {
  statusBarItem?.dispose()
}
