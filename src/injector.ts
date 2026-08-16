import type {
  ContentOptions,
  IdeInstallation,
  PatchManifest,
  PatchOptions,
  PatchResult,
  RtlStatus,
  TargetManifest,
  WorkbenchTarget,
} from './types'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  buildCss,
  buildInjection,
  buildJs,
  CSS_FILENAME,
  hasPatch,
  JS_FILENAME,
  MANIFEST_FILENAME,
  stripInjected,
} from './content'
import { exists, hashFile, hashText, isPermissionError } from './utils'

function manifestPath(installation: IdeInstallation): string {
  return path.join(installation.workbenchDir, MANIFEST_FILENAME)
}

async function readManifest(installation: IdeInstallation): Promise<PatchManifest | undefined> {
  try {
    return JSON.parse(await fs.readFile(manifestPath(installation), 'utf-8')) as PatchManifest
  }
  catch {
    return undefined
  }
}

/**
 * Relative href from a target's HTML file to an asset in the shared asset dir.
 */
function relativeAsset(target: WorkbenchTarget, fileName: string): string {
  const relativeDir = path.relative(path.dirname(target.htmlPath), target.assetDir).replace(/\\/g, '/')
  return relativeDir ? `${relativeDir}/${fileName}` : `./${fileName}`
}

async function isTargetPatched(target: WorkbenchTarget): Promise<boolean> {
  try {
    return hasPatch(await fs.readFile(target.htmlPath, 'utf-8'))
  }
  catch {
    return false
  }
}

/**
 * Check if any workbench document carries the patch.
 */
export async function isInstalled(installation: IdeInstallation): Promise<boolean> {
  for (const target of installation.targets) {
    if (await isTargetPatched(target)) {
      return true
    }
  }
  return false
}

/**
 * Check that every target is patched and the assets are present on disk.
 */
export async function isFullyInstalled(installation: IdeInstallation): Promise<boolean> {
  for (const target of installation.targets) {
    if (!(await isTargetPatched(target))) {
      return false
    }
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
    let patchedTargets = 0
    let htmlBackupExists = false

    for (const target of inst.targets) {
      if (await isTargetPatched(target)) {
        patchedTargets++
      }
      if (await exists(`${target.htmlPath}.bak`)) {
        htmlBackupExists = true
      }
    }

    statuses.push({
      installation: inst,
      isInstalled: patchedTargets > 0,
      patchedTargets,
      totalTargets: inst.targets.length,
      htmlBackupExists,
      productBackupExists: await exists(`${inst.productJsonPath}.bak`),
    })
  }

  return statuses
}

/**
 * Drop the checksums of every patched workbench document so the editor stops
 * reporting a corrupt installation.
 */
async function removeChecksums(installation: IdeInstallation, messages: string[]): Promise<void> {
  try {
    const content = await fs.readFile(installation.productJsonPath, 'utf-8')
    const product = JSON.parse(content)
    if (!product.checksums) {
      messages.push('  product.json: No checksums section — nothing to strip')
      return
    }

    const removed = installation.targets
      .map(t => t.checksumKey)
      .filter(key => key in product.checksums)

    if (removed.length === 0) {
      messages.push('  product.json: Checksums already removed')
      return
    }

    // Never overwrite an existing backup — it is the only copy of the originals.
    const backupPath = `${installation.productJsonPath}.bak`
    if (!(await exists(backupPath))) {
      await fs.copyFile(installation.productJsonPath, backupPath)
      messages.push('  product.json: Backup saved')
    }

    for (const key of removed) {
      delete product.checksums[key]
    }
    await fs.writeFile(installation.productJsonPath, JSON.stringify(product, null, '\t'), 'utf-8')
    messages.push(`  product.json: Removed ${removed.length} checksum entr${removed.length === 1 ? 'y' : 'ies'}`)
  }
  catch (e: unknown) {
    if (isPermissionError(e)) {
      messages.push(`  product.json: Permission denied at ${installation.productJsonPath}`)
    }
    else {
      messages.push(`  product.json: Error: ${(e as Error).message}`)
    }
  }
}

/**
 * Put back only the checksum entries we removed.
 *
 * Copying the whole backup over the live file would clobber unrelated changes
 * made by an IDE update that happened while the patch was applied.
 */
async function restoreChecksums(installation: IdeInstallation, messages: string[]): Promise<void> {
  const backupPath = `${installation.productJsonPath}.bak`
  if (!(await exists(backupPath))) {
    return
  }

  try {
    const backupText = await fs.readFile(backupPath, 'utf-8')
    const currentText = await fs.readFile(installation.productJsonPath, 'utf-8')
    const keys = installation.targets.map(t => t.checksumKey)

    // If our checksum keys are the only difference, put the original file back
    // verbatim so formatting and key order survive untouched.
    const expected = JSON.parse(backupText)
    if (expected.checksums) {
      for (const key of keys) {
        delete expected.checksums[key]
      }
    }

    if (JSON.stringify(expected) === JSON.stringify(JSON.parse(currentText))) {
      await fs.writeFile(installation.productJsonPath, backupText, 'utf-8')
      await fs.unlink(backupPath)
      messages.push('  product.json: Restored from backup')
      return
    }

    // product.json changed underneath us (IDE update): merge only our keys back.
    const backup = JSON.parse(backupText)
    const product = JSON.parse(currentText)
    let restored = 0

    if (backup.checksums) {
      product.checksums = product.checksums ?? {}
      for (const key of keys) {
        if (backup.checksums[key] && !product.checksums[key]) {
          product.checksums[key] = backup.checksums[key]
          restored++
        }
      }
    }

    if (restored > 0) {
      await fs.writeFile(installation.productJsonPath, JSON.stringify(product, null, '\t'), 'utf-8')
    }
    await fs.unlink(backupPath)
    messages.push(`  product.json: Merged ${restored} checksum entr${restored === 1 ? 'y' : 'ies'} back`)
  }
  catch (e: unknown) {
    messages.push(`  product.json: Checksum restore failed: ${(e as Error).message}`)
  }
}

/**
 * Write the CSS/JS assets. Returns true when anything on disk changed.
 */
async function writeAssets(
  installation: IdeInstallation,
  options: ContentOptions,
  messages: string[],
): Promise<boolean> {
  const cssPath = path.join(installation.workbenchDir, CSS_FILENAME)
  const jsPath = path.join(installation.workbenchDir, JS_FILENAME)
  const css = buildCss(options)
  const js = buildJs(options)

  let changed = false

  for (const [filePath, content] of [[cssPath, css], [jsPath, js]] as const) {
    let currentContent: string | undefined
    try {
      currentContent = await fs.readFile(filePath, 'utf-8')
    }
    catch {
      currentContent = undefined
    }
    if (currentContent !== content) {
      await fs.writeFile(filePath, content, 'utf-8')
      messages.push(`  ${path.basename(filePath)}: Written`)
      changed = true
    }
  }

  if (!changed) {
    messages.push('  Assets: Already up to date')
  }
  return changed
}

/**
 * Patch a single workbench HTML document.
 */
async function patchTarget(
  target: WorkbenchTarget,
  messages: string[],
): Promise<{ changed: boolean, manifest?: TargetManifest }> {
  const html = await fs.readFile(target.htmlPath, 'utf-8')

  // Strip first so re-patching over v1 (or a half-applied patch) yields the true original.
  const original = stripInjected(html)
  const originalHash = hashText(original)
  const backupPath = `${target.htmlPath}.bak`

  // Refresh the backup whenever it does not match this IDE build. A backup left
  // over from an older build is exactly how a restore corrupts an updated IDE.
  const backupHash = await hashFile(backupPath)
  if (backupHash !== originalHash) {
    await fs.writeFile(backupPath, original, 'utf-8')
    messages.push(`  ${target.label}: Backup ${backupHash ? 'refreshed' : 'saved'}`)
  }

  const injection = buildInjection(
    relativeAsset(target, CSS_FILENAME),
    relativeAsset(target, JS_FILENAME),
  )

  let patched: string
  const headClose = original.indexOf('</head>')
  if (headClose !== -1) {
    patched = original.substring(0, headClose) + injection + original.substring(headClose)
  }
  else {
    const htmlClose = original.lastIndexOf('</html>')
    patched = htmlClose !== -1
      ? original.substring(0, htmlClose) + injection + original.substring(htmlClose)
      : original + injection
    messages.push(`  ${target.label}: No </head> found — appended instead`)
  }

  if (patched === html) {
    messages.push(`  ${target.label}: Already patched`)
    return { changed: false, manifest: { htmlPath: target.htmlPath, originalHash } }
  }

  await fs.writeFile(target.htmlPath, patched, 'utf-8')
  messages.push(`  ${target.label}: Patched`)
  return { changed: true, manifest: { htmlPath: target.htmlPath, originalHash } }
}

/**
 * Inject RTL CSS/JS into every workbench document of an installation.
 */
export async function addRtl(installation: IdeInstallation, options: PatchOptions): Promise<PatchResult> {
  const messages: string[] = []
  let changed = false

  try {
    if (await writeAssets(installation, options, messages)) {
      changed = true
    }

    const manifestTargets: TargetManifest[] = []
    for (const target of installation.targets) {
      const result = await patchTarget(target, messages)
      if (result.changed) {
        changed = true
      }
      if (result.manifest) {
        manifestTargets.push(result.manifest)
      }
    }

    const manifest: PatchManifest = {
      extensionVersion: options.extensionVersion,
      ideName: installation.ideName,
      targets: manifestTargets,
    }
    await fs.writeFile(manifestPath(installation), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')

    await removeChecksums(installation, messages)
  }
  catch (e: unknown) {
    if (isPermissionError(e)) {
      messages.push(`  Permission denied: ${installation.workbenchHtmlPath}`)
      messages.push('  Run your IDE as Administrator, or fix ownership on macOS.')
      return { messages, changed, permissionError: true }
    }
    messages.push(`  Error: ${(e as Error).message}`)
  }

  return { messages, changed, permissionError: false }
}

/**
 * Remove the patch and restore every workbench document.
 */
export async function removeRtl(installation: IdeInstallation): Promise<PatchResult> {
  const messages: string[] = []
  let changed = false
  let permissionError = false

  const manifest = await readManifest(installation)

  for (const target of installation.targets) {
    let html: string
    try {
      html = await fs.readFile(target.htmlPath, 'utf-8')
    }
    catch (e: unknown) {
      messages.push(`  ${target.label}: Unreadable: ${(e as Error).message}`)
      continue
    }

    const backupPath = `${target.htmlPath}.bak`

    if (!hasPatch(html)) {
      messages.push(`  ${target.label}: Not patched`)
      // An IDE update can replace the HTML and strand the backup. Drop it rather
      // than leaving a file that a later restore would write over a newer build.
      const staleHash = await hashFile(backupPath)
      if (staleHash !== undefined && staleHash !== hashText(html)) {
        await fs.unlink(backupPath).catch(() => {})
        messages.push(`  ${target.label}: Removed stale backup from a previous IDE build`)
      }
      continue
    }

    // Reconstructing from the live file is always correct for the running build;
    // the backup only serves as a cross-check.
    const restored = stripInjected(html)
    const restoredHash = hashText(restored)
    const recorded = manifest?.targets.find(t => t.htmlPath === target.htmlPath)

    if (recorded && recorded.originalHash !== restoredHash) {
      messages.push(`  ${target.label}: Warning — restored content differs from the recorded original`)
    }

    try {
      await fs.writeFile(target.htmlPath, restored, 'utf-8')
      messages.push(`  ${target.label}: Restored`)
      changed = true
    }
    catch (e: unknown) {
      if (isPermissionError(e)) {
        permissionError = true
      }
      messages.push(`  ${target.label}: Restore failed: ${(e as Error).message}`)
      continue
    }

    if (await exists(backupPath)) {
      await fs.unlink(backupPath).catch(() => {})
    }
  }

  await restoreChecksums(installation, messages)

  for (const fileName of [CSS_FILENAME, JS_FILENAME, MANIFEST_FILENAME]) {
    const filePath = path.join(installation.workbenchDir, fileName)
    if (await exists(filePath)) {
      try {
        await fs.unlink(filePath)
        messages.push(`  Deleted ${fileName}`)
      }
      catch (e: unknown) {
        messages.push(`  Failed to delete ${fileName}: ${(e as Error).message}`)
      }
    }
  }

  return { messages, changed, permissionError }
}

/**
 * Rewrite the CSS/JS assets without touching workbench HTML.
 * Used when settings change or the extension is updated in place.
 */
export async function reinjectAssets(
  installation: IdeInstallation,
  options: ContentOptions,
): Promise<PatchResult> {
  const messages: string[] = []

  if (!(await isInstalled(installation))) {
    return { messages, changed: false, permissionError: false }
  }

  try {
    const changed = await writeAssets(installation, options, messages)
    return { messages, changed, permissionError: false }
  }
  catch (e: unknown) {
    messages.push(`  Asset refresh failed: ${(e as Error).message}`)
    return { messages, changed: false, permissionError: isPermissionError(e) }
  }
}
