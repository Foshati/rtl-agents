import type { IdeInstallation } from './types'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { exists } from './utils'

/** Paths to check inside appRoot for workbench.html and their corresponding product.json checksum keys */
interface WorkbenchPathConfig {
  relativePath: string
  checksumKey: string
}

const WORKBENCH_CONFIGS: WorkbenchPathConfig[] = [
  {
    relativePath: path.join('out', 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.html'),
    checksumKey: 'vs/code/electron-sandbox/workbench/workbench.html',
  },
  {
    relativePath: path.join('out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench.html'),
    checksumKey: 'vs/code/electron-browser/workbench/workbench.html',
  },
  {
    relativePath: path.join('out', 'vs', 'workbench', 'workbench.html'),
    checksumKey: 'vs/workbench/workbench.html',
  },
]

/**
 * Find the running IDE installation using vscode.env.appRoot.
 * Returns an array with 0 or 1 entries.
 */
export async function findIdeInstallations(): Promise<IdeInstallation[]> {
  const resourcesApp = vscode.env.appRoot

  const productJsonPath = path.join(resourcesApp, 'product.json')
  if (!(await exists(productJsonPath))) {
    return []
  }

  for (const config of WORKBENCH_CONFIGS) {
    const workbenchHtmlPath = path.join(resourcesApp, config.relativePath)
    if (await exists(workbenchHtmlPath)) {
      let workbenchDir = path.join(resourcesApp, 'out', 'vs', 'workbench')
      if (!(await exists(workbenchDir))) {
        // Resolve 3 levels up and into sibling 'workbench' folder
        const siblingWorkbench = path.resolve(path.dirname(workbenchHtmlPath), '..', '..', '..', 'workbench')
        if (await exists(siblingWorkbench)) {
          workbenchDir = siblingWorkbench
        }
        else {
          workbenchDir = path.dirname(workbenchHtmlPath)
        }
      }

      return [{
        ideName: vscode.env.appName,
        workbenchHtmlPath,
        workbenchDir,
        productJsonPath,
        checksumKey: config.checksumKey,
      }]
    }
  }

  return []
}
