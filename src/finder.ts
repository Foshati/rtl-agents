import type { IdeInstallation, WorkbenchTarget } from './types'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { exists } from './utils'

/** Directories inside appRoot that can hold workbench HTML documents */
const WORKBENCH_DIR_CANDIDATES = [
  ['out', 'vs', 'code', 'electron-sandbox', 'workbench'],
  ['out', 'vs', 'code', 'electron-browser', 'workbench'],
  ['out', 'vs', 'workbench'],
]

/**
 * Matches `workbench.html` and forks' extra shells such as Antigravity's
 * `workbench-jetski-agent.html`, which hosts the standalone agent window.
 */
const HTML_PATTERN = /^workbench(?:-[\w-]+)?\.html$/i

/**
 * Find the running IDE installation using vscode.env.appRoot.
 * Returns an array with 0 or 1 entries.
 */
export async function findIdeInstallations(): Promise<IdeInstallation[]> {
  const appRoot = vscode.env.appRoot

  const productJsonPath = path.join(appRoot, 'product.json')
  if (!(await exists(productJsonPath))) {
    return []
  }

  const outDir = path.join(appRoot, 'out')
  const targets: WorkbenchTarget[] = []

  for (const segments of WORKBENCH_DIR_CANDIDATES) {
    const dir = path.join(appRoot, ...segments)
    if (!(await exists(dir))) {
      continue
    }

    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    }
    catch {
      continue
    }

    for (const name of entries) {
      if (!HTML_PATTERN.test(name) || /-dev\.html$/i.test(name)) {
        continue
      }
      const htmlPath = path.join(dir, name)
      targets.push({
        label: name,
        htmlPath,
        checksumKey: path.relative(outDir, htmlPath).split(path.sep).join('/'),
        assetDir: '',
      })
    }
  }

  if (targets.length === 0) {
    return []
  }

  // Assets live in one shared folder; every target links to it relatively.
  let assetDir = path.join(outDir, 'vs', 'workbench')
  if (!(await exists(assetDir))) {
    assetDir = path.dirname(targets[0].htmlPath)
  }
  for (const target of targets) {
    target.assetDir = assetDir
  }

  // Keep the main shell first — it is the one used in messages and permission hints.
  targets.sort((a, b) => {
    if (a.label === 'workbench.html') {
      return -1
    }
    if (b.label === 'workbench.html') {
      return 1
    }
    return a.label.localeCompare(b.label)
  })

  return [{
    ideName: vscode.env.appName,
    appRoot,
    productJsonPath,
    targets,
    workbenchHtmlPath: targets[0].htmlPath,
    workbenchDir: assetDir,
  }]
}
