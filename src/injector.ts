import type { IdeInstallation, RtlStatus } from './types'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { CSS_FILENAME, HTML_LINK_MARKER, JS_FILENAME, RTL_CSS, RTL_JS } from './content'
import { exists } from './utils'

/**
 * Check if RTL tags are present in workbench.html.
 */
export async function isInstalled(installation: IdeInstallation): Promise<boolean> {
  try {
    const content = await fs.readFile(installation.workbenchHtmlPath, 'utf-8')
    return content.includes(HTML_LINK_MARKER)
  }
  catch {
    return false
  }
}

/**
 * Check if the extension is fully active (tags present in HTML and JS/CSS exist on disk).
 */
export async function isFullyInstalled(installation: IdeInstallation): Promise<boolean> {
  if (!(await isInstalled(installation))) {
    return false
  }
  const cssPath = path.join(installation.workbenchDir, CSS_FILENAME)
  const jsPath = path.join(installation.workbenchDir, JS_FILENAME)
  return (await exists(cssPath)) && (await exists(jsPath))
}

/**
 * Get the RTL status for all detected IDE installations.
 */
export async function getStatus(installations: IdeInstallation[]): Promise<RtlStatus[]> {
  const statuses: RtlStatus[] = []

  for (const inst of installations) {
    statuses.push({
      installation: inst,
      isInstalled: await isInstalled(inst),
      htmlBackupExists: await exists(`${inst.workbenchHtmlPath}.bak`),
      productBackupExists: await exists(`${inst.productJsonPath}.bak`),
    })
  }

  return statuses
}

/**
 * Remove the checksum of workbench.html from product.json to avoid corrupt installation alert.
 */
async function removeChecksum(installation: IdeInstallation, messages: string[]): Promise<void> {
  try {
    const content = await fs.readFile(installation.productJsonPath, 'utf-8')
    const product = JSON.parse(content)

    if (product.checksums && product.checksums[installation.checksumKey]) {
      // Save product.json backup
      const backupPath = `${installation.productJsonPath}.bak`
      await fs.copyFile(installation.productJsonPath, backupPath)
      messages.push('  product.json: Backup saved')

      delete product.checksums[installation.checksumKey]
      await fs.writeFile(installation.productJsonPath, JSON.stringify(product, null, '\t'), 'utf-8')
      messages.push('  product.json: Successfully removed checksum entry')
    }
    else {
      messages.push('  product.json: Checksum already removed or not found')
    }
  }
  catch (e: unknown) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      messages.push(`  product.json: Permission denied to ${installation.productJsonPath}`)
      messages.push('       Please try running with Administrator/sudo privileges.')
    }
    else {
      messages.push(`  product.json: Error: ${err.message}`)
    }
  }
}

/**
 * Restore product.json from its backup file.
 */
async function restoreProductJson(installation: IdeInstallation, messages: string[]): Promise<void> {
  const backupPath = `${installation.productJsonPath}.bak`
  if (await exists(backupPath)) {
    try {
      await fs.copyFile(backupPath, installation.productJsonPath)
      await fs.unlink(backupPath)
      messages.push('  product.json: Restored from backup')
    }
    catch (e: unknown) {
      messages.push(`  product.json: Restore failed: ${(e as Error).message}`)
    }
  }
}

/**
 * Inject RTL CSS, JS and patch workbench.html.
 */
export async function addRtl(installation: IdeInstallation): Promise<{ messages: string[], changed: boolean, permissionError: boolean }> {
  const messages: string[] = []
  let changed = false
  let permissionError = false

  // If already installed, just refresh CSS/JS (in case settings or extension version changed)
  if (await isInstalled(installation)) {
    const reinject = await reinjectAssets(installation)
    const updated = reinject.messages.some(m => m.includes('Re-written'))
    messages.push(
      updated
        ? `  RTL already installed in ${installation.ideName} — Assets updated with current settings`
        : `  RTL already installed in ${installation.ideName}`,
    )
    return { messages, changed: reinject.changed, permissionError: reinject.permissionError }
  }

  try {
    // 1. Backup workbench.html
    const htmlBackupPath = `${installation.workbenchHtmlPath}.bak`
    await fs.copyFile(installation.workbenchHtmlPath, htmlBackupPath)
    messages.push('  workbench.html: Backup saved')

    // 2. Write CSS asset to workbenchDir
    const cssPath = path.join(installation.workbenchDir, CSS_FILENAME)
    await fs.writeFile(cssPath, RTL_CSS, 'utf-8')
    messages.push(`  CSS: Written to ${cssPath}`)

    // 3. Write JS asset to workbenchDir
    const jsPath = path.join(installation.workbenchDir, JS_FILENAME)
    await fs.writeFile(jsPath, RTL_JS, 'utf-8')
    messages.push(`  JS: Written to ${jsPath}`)

    // 4. Calculate relative paths
    const relativeDir = path.relative(
      path.dirname(installation.workbenchHtmlPath),
      installation.workbenchDir,
    )
    const normalizedRelativeDir = relativeDir.replace(/\\/g, '/')
    const relativeCssPath = normalizedRelativeDir ? `${normalizedRelativeDir}/${CSS_FILENAME}` : `./${CSS_FILENAME}`
    const relativeJsPath = normalizedRelativeDir ? `${normalizedRelativeDir}/${JS_FILENAME}` : `./${JS_FILENAME}`

    // 5. Modify workbench.html
    let html = await fs.readFile(installation.workbenchHtmlPath, 'utf-8')

    // Inject CSS link after main CSS link
    const cssPattern = /<link[^>]*workbench\.desktop\.main\.css[^>]*>/
    const cssMatch = html.match(cssPattern)
    const cssLinkTag = `\n\t<!-- RTL Agents Support -->\n\t<link rel="stylesheet" href="${relativeCssPath}">`

    if (cssMatch) {
      const insertPos = cssMatch.index! + cssMatch[0].length
      html = html.substring(0, insertPos) + cssLinkTag + html.substring(insertPos)
    }
    else {
      const headClose = html.indexOf('</head>')
      if (headClose !== -1) {
        html = `${html.substring(0, headClose) + cssLinkTag}\n${html.substring(headClose)}`
      }
    }

    // Inject Script tag before </html>
    const scriptTag = `\t<!-- RTL Agents Support -->\n\t<script src="${relativeJsPath}"></script>\n`
    const htmlClose = html.lastIndexOf('</html>')
    if (htmlClose !== -1) {
      html = html.substring(0, htmlClose) + scriptTag + html.substring(htmlClose)
    }

    await fs.writeFile(installation.workbenchHtmlPath, html, 'utf-8')
    messages.push('  workbench.html: Tags successfully injected')
    changed = true

    // 6. Strip checksum from product.json
    await removeChecksum(installation, messages)
  }
  catch (e: unknown) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      permissionError = true
      messages.push(`  Permission denied: ${installation.workbenchHtmlPath}`)
      messages.push('  Please run your IDE as Administrator (or apply sudo permissions on macOS).')
    }
    else {
      messages.push(`  Error: ${err.message}`)
    }
  }

  return { messages, changed, permissionError }
}

/**
 * Remove patch and restore backups.
 */
export async function removeRtl(installation: IdeInstallation): Promise<{ messages: string[], changed: boolean }> {
  const messages: string[] = []
  let changed = false

  if (!(await isInstalled(installation))) {
    messages.push(`  RTL not active in ${installation.ideName}`)
    return { messages, changed }
  }

  // 1. Restore workbench.html
  const htmlBackupPath = `${installation.workbenchHtmlPath}.bak`
  let htmlRestored = false

  if (await exists(htmlBackupPath)) {
    try {
      await fs.copyFile(htmlBackupPath, installation.workbenchHtmlPath)
      await fs.unlink(htmlBackupPath)
      messages.push('  workbench.html: Restored from backup')
      htmlRestored = true
      changed = true
    }
    catch (e: unknown) {
      messages.push(`  workbench.html: Backup restore failed: ${(e as Error).message}. Attempting manual removal...`)
    }
  }

  if (!htmlRestored) {
    try {
      let html = await fs.readFile(installation.workbenchHtmlPath, 'utf-8')

      // Regex search to strip injected markup
      html = html.replace(/\n?\t?<!-- RTL Agents Support -->\n\t<link[^>]*rtl-agents\.css[^>]*>/g, '')
      html = html.replace(/\n?\t?<!-- RTL Agents Support -->\n\t<script[^>]*rtl-agents\.js[^>]*><\/script>\n?/g, '')

      await fs.writeFile(installation.workbenchHtmlPath, html, 'utf-8')
      messages.push('  workbench.html: Injected tags stripped manually')
      changed = true
    }
    catch (e: unknown) {
      messages.push(`  workbench.html: Manual tag removal failed: ${(e as Error).message}`)
    }
  }

  // 2. Restore product.json
  await restoreProductJson(installation, messages)

  // 3. Delete static assets
  const cssPath = path.join(installation.workbenchDir, CSS_FILENAME)
  const jsPath = path.join(installation.workbenchDir, JS_FILENAME)

  for (const filePath of [cssPath, jsPath]) {
    if (await exists(filePath)) {
      try {
        await fs.unlink(filePath)
        messages.push(`  Deleted asset file: ${path.basename(filePath)}`)
      }
      catch (e: unknown) {
        messages.push(`  Failed to delete ${path.basename(filePath)}: ${(e as Error).message}`)
      }
    }
  }

  return { messages, changed }
}

/**
 * Re-inject Javascript/CSS assets if they are stale or missing, without touching workbench.html.
 */
export async function reinjectAssets(
  installation: IdeInstallation,
): Promise<{ messages: string[], changed: boolean, permissionError: boolean }> {
  const messages: string[] = []
  if (!(await isInstalled(installation))) {
    return { messages, changed: false, permissionError: false }
  }

  try {
    const cssPath = path.join(installation.workbenchDir, CSS_FILENAME)
    const jsPath = path.join(installation.workbenchDir, JS_FILENAME)

    let cssMatches = false
    let jsMatches = false

    try {
      cssMatches = (await fs.readFile(cssPath, 'utf-8')) === RTL_CSS
      jsMatches = (await fs.readFile(jsPath, 'utf-8')) === RTL_JS
    }
    catch {
      // If reading fails, file is missing or corrupted, so write it.
    }

    if (cssMatches && jsMatches) {
      messages.push('  Assets: Already up to date with latest configuration')
      return { messages, changed: false, permissionError: false }
    }

    await fs.writeFile(cssPath, RTL_CSS, 'utf-8')
    await fs.writeFile(jsPath, RTL_JS, 'utf-8')
    messages.push('  Assets: Re-written with updated configurations')
    return { messages, changed: true, permissionError: false }
  }
  catch (e: unknown) {
    const err = e as { code?: string, message: string }
    const permissionError = err.code === 'EPERM' || err.code === 'EACCES'
    messages.push(`  Asset reinjection failed: ${err.message}`)
    return { messages, changed: false, permissionError }
  }
}
