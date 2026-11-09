/**
 * Support for the standalone Antigravity desktop app.
 *
 * Antigravity ships two products: the IDE (a VS Code fork this extension runs in)
 * and a separate Electron app whose whole window is the agent chat. The app has
 * no extension host and no workbench HTML, so there is nothing to patch the way
 * the IDE is patched — but it is the same chat page, and the same runtime works
 * in it once something loads it.
 *
 * The app's code lives in `app.asar`. The patch points the archive's entry
 * point at a three-line loader appended to the archive: it loads RTL Agents'
 * hook from a folder outside the app, then hands over to the app's own entry
 * point. Everything else in the archive stays byte for byte as it was, and a
 * copy of the original archive is kept beside the hook so removal puts back
 * exactly what was there.
 *
 * Keeping the hook and its assets outside the bundle means a settings change or
 * an extension update never touches the app again. Only an app update — which
 * replaces the archive — needs the patch re-applied, and the extension does that
 * from the IDE the next time it starts.
 *
 * (Electron does not prefer an `app/` folder over `app.asar` in this app, so the
 * loader has to be inside the archive.)
 */

import type { ContentOptions } from './types'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import { buildCss, buildJs, CSS_FILENAME, JS_FILENAME } from './content'
import { buildMainHook } from './mainHook'
import { exists } from './utils'

/** The hook module, loaded by the archive's loader; CommonJS like the app */
export const STANDALONE_HOOK_FILENAME = 'rtl-agents-main.cjs'

/** Copy of the archive as it was before the patch */
const BACKUP_FILENAME = 'app.asar.original'

/** Folder inside the archive that holds what the patch adds */
const PATCH_DIR = 'rtl-agents'

/** Everything the patch adds to the archive, inside `PATCH_DIR` */
const LOADER_FILE = 'index.js'
const RECORD_FILE = 'patch.json'

/** Legacy folder from the first 2.4.0 builds; removed whenever it is ours */
const LEGACY_SHIM_DIR = 'app'

export interface StandaloneApp {
  /** What to call it in messages */
  name: string
  /** The app's `Resources` directory */
  resourcesDir: string
  /** `app.asar` inside it */
  asarPath: string
  /** Folder outside the app that holds the hook, its assets and the backup */
  dataDir: string
}

export interface StandaloneOptions extends ContentOptions {
  extensionVersion: string
}

/* --------------------------------------------------------------------------
   asar archives

   Layout: a 16-byte prefix of four little-endian uint32s — 4, the header pickle
   size, the string pickle size, the JSON length — then the JSON header padded to
   4 bytes, then file data. A file's offset counts from the start of the data,
   so a header can grow or shrink without moving any file.
   -------------------------------------------------------------------------- */

interface AsarFile {
  size: number
  offset: string
  integrity?: { algorithm: string, hash: string, blockSize: number, blocks: string[] }
  unpacked?: boolean
  executable?: boolean
}

interface AsarDir {
  files: Record<string, AsarNode>
}

type AsarNode = AsarFile | AsarDir

interface Asar {
  header: AsarDir
  /** File data: everything after the header */
  data: Buffer
}

const BLOCK_SIZE = 4 * 1024 * 1024

function isDir(node: AsarNode | undefined): node is AsarDir {
  return Boolean(node && 'files' in node)
}

function parseAsar(buffer: Buffer): Asar | undefined {
  if (buffer.length < 16 || buffer.readUInt32LE(0) !== 4) {
    return undefined
  }
  const headerSize = buffer.readUInt32LE(4)
  const jsonLength = buffer.readUInt32LE(12)
  if (jsonLength === 0 || jsonLength > headerSize || 8 + headerSize > buffer.length) {
    return undefined
  }
  try {
    const header = JSON.parse(buffer.subarray(16, 16 + jsonLength).toString('utf-8')) as AsarDir
    return isDir(header) ? { header, data: buffer.subarray(8 + headerSize) } : undefined
  }
  catch {
    return undefined
  }
}

function serializeAsar(asar: Asar): Buffer {
  const json = Buffer.from(JSON.stringify(asar.header), 'utf-8')
  const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4)])
  const prefix = Buffer.alloc(16)
  prefix.writeUInt32LE(4, 0)
  prefix.writeUInt32LE(padded.length + 8, 4)
  prefix.writeUInt32LE(padded.length + 4, 8)
  prefix.writeUInt32LE(json.length, 12)
  return Buffer.concat([prefix, padded, asar.data])
}

function lookup(asar: Asar, inner: string): AsarNode | undefined {
  let node: AsarNode | undefined = asar.header
  for (const part of inner.split('/').filter(Boolean)) {
    node = isDir(node) ? node.files[part] : undefined
  }
  return node
}

function contentOf(asar: Asar, inner: string): Buffer | undefined {
  const node = lookup(asar, inner)
  if (!node || isDir(node) || node.unpacked) {
    return undefined
  }
  const start = Number(node.offset)
  return asar.data.subarray(start, start + node.size)
}

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

/** The per-file integrity record Electron writes, so the archive stays well formed */
function integrityOf(data: Buffer): AsarFile['integrity'] {
  const blocks: string[] = []
  for (let i = 0; i < data.length || i === 0; i += BLOCK_SIZE) {
    blocks.push(sha256(data.subarray(i, i + BLOCK_SIZE)))
  }
  return { algorithm: 'SHA256', hash: sha256(data), blockSize: BLOCK_SIZE, blocks }
}

/**
 * Read one file out of an asar archive without Electron's asar-aware fs, so it
 * behaves the same in the extension host and under plain Node.
 */
export async function readAsarFile(asarPath: string, inner: string): Promise<Buffer | undefined> {
  const buffer = await fs.readFile(asarPath).catch(() => undefined)
  const asar = buffer && parseAsar(buffer)
  return asar ? contentOf(asar, inner) : undefined
}

/* --------------------------------------------------------------------------
   Patch
   -------------------------------------------------------------------------- */

interface PatchRecord {
  /** The archive's own entry point */
  main: string
  /** Where the original package.json lives in the data section */
  packageEntry: AsarFile
  /** Length of the data section before anything was appended */
  dataLength: number
  /** sha256 of the original archive, matched against the backup */
  originalHash: string
}

interface AppPackage {
  name?: string
  productName?: string
  main?: string
}

function readPackage(asar: Asar): AppPackage | undefined {
  try {
    return JSON.parse(contentOf(asar, 'package.json')?.toString('utf-8') ?? '') as AppPackage
  }
  catch {
    return undefined
  }
}

function readRecord(asar: Asar): PatchRecord | undefined {
  try {
    return JSON.parse(contentOf(asar, `${PATCH_DIR}/${RECORD_FILE}`)?.toString('utf-8') ?? '') as PatchRecord
  }
  catch {
    return undefined
  }
}

/** The loader the archive starts: RTL Agents first, never fatally, then the app. */
export function buildLoader(hookPath: string, main: string): string {
  return `/* RTL-AGENTS — loads RTL Agents, then the app's own entry point. */
'use strict';
try { require(${JSON.stringify(hookPath)}); } catch (e) { /* never keep the app from starting */ }
require(${JSON.stringify(`../${main.replace(/^\.?\//, '')}`)});
`
}

/**
 * Return the patched archive. `original` must be unpatched.
 */
function patchArchive(original: Buffer, asar: Asar, hookPath: string): Buffer | undefined {
  const pkgEntry = lookup(asar, 'package.json')
  const pkg = readPackage(asar)
  if (!pkgEntry || isDir(pkgEntry) || !pkg || typeof pkg.main !== 'string') {
    return undefined
  }

  const record: PatchRecord = {
    main: pkg.main,
    packageEntry: { ...pkgEntry },
    dataLength: asar.data.length,
    originalHash: sha256(original),
  }

  // Only `main` changes; every other field, and every other file, is untouched.
  const blobs: Array<[string, Buffer]> = [
    ['package.json', Buffer.from(JSON.stringify({ ...pkg, main: `${PATCH_DIR}/${LOADER_FILE}` }, null, 2), 'utf-8')],
    [LOADER_FILE, Buffer.from(buildLoader(hookPath, pkg.main), 'utf-8')],
    [RECORD_FILE, Buffer.from(JSON.stringify(record), 'utf-8')],
  ]

  const header = structuredClone(asar.header)
  const added: Record<string, AsarNode> = {}
  let offset = asar.data.length
  const chunks: Buffer[] = [asar.data]
  for (const [name, data] of blobs) {
    const entry: AsarFile = { size: data.length, offset: String(offset), integrity: integrityOf(data) }
    if (name === 'package.json') {
      header.files['package.json'] = entry
    }
    else {
      added[name] = entry
    }
    chunks.push(data)
    offset += data.length
  }
  header.files[PATCH_DIR] = { files: added }

  return serializeAsar({ header, data: Buffer.concat(chunks) })
}

/**
 * Rebuild the original archive from a patched one, for when the backup is gone.
 * The data section is cut back to its original length, so only the header can
 * differ from the original bytes — and only in how its JSON is spelled.
 */
function unpatchArchive(asar: Asar): Buffer | undefined {
  const record = readRecord(asar)
  if (!record) {
    return undefined
  }
  const header = structuredClone(asar.header)
  delete header.files[PATCH_DIR]
  header.files['package.json'] = record.packageEntry
  return serializeAsar({ header, data: asar.data.subarray(0, record.dataLength) })
}

/* --------------------------------------------------------------------------
   Discovery
   -------------------------------------------------------------------------- */

/** Where the app is installed, per platform. Only macOS has been verified. */
export function standaloneCandidates(): string[] {
  const home = os.homedir()
  switch (process.platform) {
    case 'darwin':
      return [
        '/Applications/Antigravity.app/Contents/Resources',
        path.join(home, 'Applications', 'Antigravity.app', 'Contents', 'Resources'),
      ]
    case 'win32':
      return [
        path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Programs', 'Antigravity', 'resources'),
        path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Antigravity', 'resources'),
      ]
    default:
      return [
        '/opt/Antigravity/resources',
        '/usr/lib/antigravity/resources',
        path.join(home, '.local', 'share', 'Antigravity', 'resources'),
      ]
  }
}

/** The app's own data folder (Electron's `userData`), where the hook is kept. */
export function standaloneDataDir(): string {
  const home = os.homedir()
  const base = process.platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support')
    : process.platform === 'win32'
      ? (process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'))
      : (process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'))
  return path.join(base, 'Antigravity', 'rtl-agents')
}

/**
 * Find installed copies of the standalone app.
 *
 * Recognised by an `app.asar` whose package is named `antigravity`, so the IDE
 * and unrelated Electron apps are never mistaken for it.
 */
export async function findStandaloneApps(
  candidates: string[] = standaloneCandidates(),
  dataDir: string = standaloneDataDir(),
): Promise<StandaloneApp[]> {
  const found: StandaloneApp[] = []
  for (const resourcesDir of candidates) {
    const asarPath = path.join(resourcesDir, 'app.asar')
    const raw = await readAsarFile(asarPath, 'package.json')
    if (!raw) {
      continue
    }
    let pkg: AppPackage
    try {
      pkg = JSON.parse(raw.toString('utf-8')) as AppPackage
    }
    catch {
      continue
    }
    if (pkg.name !== 'antigravity' || typeof pkg.main !== 'string') {
      continue
    }
    found.push({ name: pkg.productName ?? 'Antigravity', resourcesDir, asarPath, dataDir })
  }
  return found
}

/* --------------------------------------------------------------------------
   Apply / remove
   -------------------------------------------------------------------------- */

function hookPathOf(app: StandaloneApp): string {
  return path.join(app.dataDir, STANDALONE_HOOK_FILENAME)
}

/** What the data folder must contain for these options, by file name. */
function dataFiles(options: StandaloneOptions): Record<string, string> {
  return {
    [STANDALONE_HOOK_FILENAME]: buildMainHook('cjs'),
    [CSS_FILENAME]: buildCss(options),
    [JS_FILENAME]: buildJs(options),
  }
}

async function loadAsar(app: StandaloneApp): Promise<{ buffer: Buffer, asar: Asar } | undefined> {
  const buffer = await fs.readFile(app.asarPath).catch(() => undefined)
  const asar = buffer && parseAsar(buffer)
  return buffer && asar ? { buffer, asar } : undefined
}

/** Whether the archive's loader is ours and points at this app's hook. */
function loaderCurrent(asar: Asar, app: StandaloneApp): boolean {
  const record = readRecord(asar)
  const loader = contentOf(asar, `${PATCH_DIR}/${LOADER_FILE}`)?.toString('utf-8')
  return Boolean(record && loader === buildLoader(hookPathOf(app), record.main))
}

/** Replace a file without ever leaving it half written: write aside, then rename. */
async function replaceFile(target: string, data: Buffer): Promise<void> {
  const temp = `${target}.rtl-agents-tmp`
  await fs.writeFile(temp, data)
  await fs.rename(temp, target)
}

/** Remove the `app/` folder the first 2.4.0 builds wrote, if it is theirs. */
async function removeLegacyShim(app: StandaloneApp, messages: string[]): Promise<boolean> {
  const dir = path.join(app.resourcesDir, LEGACY_SHIM_DIR)
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf-8'))
    if (!pkg?.rtlAgents) {
      return false
    }
  }
  catch {
    return false
  }
  await fs.rm(dir, { recursive: true, force: true })
  messages.push(`  ${app.name}: Removed the folder an earlier build left in the app`)
  return true
}

/** Whether the archive carries our loader, current or not. */
export async function isStandalonePatched(app: StandaloneApp): Promise<boolean> {
  const loaded = await loadAsar(app)
  return Boolean(loaded && readRecord(loaded.asar))
}

/**
 * Whether the archive is patched and the hook and assets are exactly what this
 * version would write.
 */
export async function standaloneCurrent(app: StandaloneApp, options: StandaloneOptions): Promise<boolean> {
  const loaded = await loadAsar(app)
  if (!loaded || !loaderCurrent(loaded.asar, app)) {
    return false
  }
  if (await exists(path.join(app.resourcesDir, LEGACY_SHIM_DIR, 'package.json'))) {
    return false
  }
  for (const [name, content] of Object.entries(dataFiles(options))) {
    const actual = await fs.readFile(path.join(app.dataDir, name), 'utf-8').catch(() => undefined)
    if (actual !== content) {
      return false
    }
  }
  return true
}

/**
 * Write the hook and assets, and patch the archive if it is not patched yet.
 * Returns true when anything changed — only an archive change needs the app
 * restarted, but a changed asset is picked up on its next reload as well.
 */
export async function applyStandalone(
  app: StandaloneApp,
  options: StandaloneOptions,
  messages: string[],
): Promise<boolean> {
  const loaded = await loadAsar(app)
  if (!loaded) {
    messages.push(`  ${app.name}: Could not read ${app.asarPath} — left alone`)
    return false
  }

  let changed = await removeLegacyShim(app, messages)

  await fs.mkdir(app.dataDir, { recursive: true })
  for (const [name, content] of Object.entries(dataFiles(options))) {
    const target = path.join(app.dataDir, name)
    const current = await fs.readFile(target, 'utf-8').catch(() => undefined)
    if (current !== content) {
      await fs.writeFile(target, content, 'utf-8')
      changed = true
    }
  }

  let { buffer, asar } = loaded
  if (readRecord(asar) && !loaderCurrent(asar, app)) {
    // Patched by another build, or pointing elsewhere: start again from the original.
    const original = unpatchArchive(asar)
    const reparsed = original && parseAsar(original)
    if (!original || !reparsed) {
      messages.push(`  ${app.name}: Archive carries an unreadable patch — left alone`)
      return changed
    }
    buffer = original
    asar = reparsed
  }

  if (!readRecord(asar)) {
    const patched = patchArchive(buffer, asar, hookPathOf(app))
    if (!patched) {
      messages.push(`  ${app.name}: Could not find the app's entry point — left alone`)
      return changed
    }
    // The backup is what removal restores; it must be this exact archive.
    await fs.writeFile(path.join(app.dataDir, BACKUP_FILENAME), buffer)
    await replaceFile(app.asarPath, patched)
    messages.push(`  ${app.name}: Hook installed`)
    return true
  }

  messages.push(`  ${app.name}: ${changed ? 'Hook files updated' : 'Hook already up to date'}`)
  return changed
}

/**
 * Restore the original archive and delete the hook folder.
 * Returns true when anything was removed.
 */
export async function removeStandalone(app: StandaloneApp, messages: string[]): Promise<boolean> {
  let changed = await removeLegacyShim(app, messages)
  const loaded = await loadAsar(app)
  const record = loaded && readRecord(loaded.asar)

  if (loaded && record) {
    const backupPath = path.join(app.dataDir, BACKUP_FILENAME)
    const backup = await fs.readFile(backupPath).catch(() => undefined)
    const original = backup && sha256(backup) === record.originalHash ? backup : unpatchArchive(loaded.asar)
    if (!original) {
      messages.push(`  ${app.name}: Could not rebuild the original archive — left alone`)
      return changed
    }
    await replaceFile(app.asarPath, original)
    messages.push(`  ${app.name}: Original app restored${original === backup ? ' from backup' : ''}`)
    changed = true
  }

  if (await exists(app.dataDir)) {
    await fs.rm(app.dataDir, { recursive: true, force: true })
    changed = true
  }
  return changed
}

/* --------------------------------------------------------------------------
   macOS approval
   -------------------------------------------------------------------------- */

/**
 * Whether a macOS quarantine value says the app was downloaded and never opened.
 *
 * The attribute reads `flags;timestamp;agent;uuid`. A fresh download carries
 * 0x0001 and macOS adds 0x0002 once the user has opened it and Gatekeeper has
 * approved it. These flags are not documented, so this is a heuristic — and it
 * is only used to *decline* to modify an app, which is the safe direction.
 */
export function quarantineUnopened(value: string | undefined): boolean {
  if (!value) {
    return false
  }
  const flags = Number.parseInt(value.split(';')[0], 16)
  return Number.isFinite(flags) && (flags & 0x0002) === 0
}

/** The app bundle a `Resources` directory belongs to, on macOS */
function bundleOf(app: StandaloneApp): string {
  return path.dirname(path.dirname(app.resourcesDir))
}

/**
 * Read the app's quarantine attribute. Changing a bundle macOS has not approved
 * yet makes Gatekeeper call it damaged the first time it opens.
 */
export function readQuarantine(app: StandaloneApp): Promise<string | undefined> {
  if (process.platform !== 'darwin') {
    return Promise.resolve(undefined)
  }
  return new Promise((resolve) => {
    execFile('xattr', ['-p', 'com.apple.quarantine', bundleOf(app)], { timeout: 5000 }, (error, stdout) => {
      resolve(error ? undefined : stdout.trim())
    })
  })
}

/* --------------------------------------------------------------------------
   Orchestration
   -------------------------------------------------------------------------- */

export interface StandaloneResult {
  changed: boolean
  permissionError: boolean
  /** An app was left alone because macOS has not approved it yet */
  blocked?: boolean
}

/** Shown when the operating system stops one app from modifying another. */
export const STANDALONE_PERMISSION_HINT = 'macOS may block one app from changing another. Allow your IDE under System Settings → Privacy & Security → App Management, then run "RTL Agents: Restart RTL".'

/** Shown when the app was left alone because macOS has not approved it yet. */
export const STANDALONE_UNAPPROVED_HINT = 'RTL Agents: The Antigravity app was left unchanged — macOS has not approved this copy yet, and changing it now would make it open as "damaged". Open it once from Finder (right-click → Open), quit it, then run "RTL Agents: Restart RTL".'

function recordFailure(app: StandaloneApp, e: unknown, result: StandaloneResult, messages: string[]): void {
  const code = (e as NodeJS.ErrnoException).code
  if (code === 'EPERM' || code === 'EACCES') {
    result.permissionError = true
    messages.push(`  ${app.name}: Permission denied at ${app.resourcesDir}`)
    messages.push(`  ${STANDALONE_PERMISSION_HINT}`)
  }
  else {
    messages.push(`  ${app.name}: Error: ${(e as Error).message}`)
  }
}

/**
 * Bring every app in line with this build: write what is missing or outdated and
 * leave what is current alone.
 */
export async function syncStandalone(
  apps: StandaloneApp[],
  options: StandaloneOptions,
  messages: string[],
  quarantineOf: (app: StandaloneApp) => Promise<string | undefined> = readQuarantine,
): Promise<StandaloneResult> {
  const result: StandaloneResult = { changed: false, permissionError: false }
  for (const app of apps) {
    try {
      // Never touch an app macOS has not yet approved: it would be reported as
      // damaged and refuse to open. A patch that is already there stays maintained.
      if (!(await isStandalonePatched(app)) && quarantineUnopened(await quarantineOf(app))) {
        result.blocked = true
        messages.push(`  ${app.name}: Skipped — macOS has not approved this copy yet, and changing it now would make it open as "damaged".`)
        messages.push(`  Open ${bundleOf(app)} once from Finder (right-click → Open), quit it, then run "RTL Agents: Restart RTL".`)
        continue
      }
      if (await applyStandalone(app, options, messages)) {
        result.changed = true
      }
    }
    catch (e: unknown) {
      recordFailure(app, e, result, messages)
    }
  }
  return result
}

/**
 * Take the patch out of every app.
 */
export async function unsyncStandalone(apps: StandaloneApp[], messages: string[]): Promise<StandaloneResult> {
  const result: StandaloneResult = { changed: false, permissionError: false }
  for (const app of apps) {
    try {
      if (await removeStandalone(app, messages)) {
        result.changed = true
      }
    }
    catch (e: unknown) {
      recordFailure(app, e, result, messages)
    }
  }
  return result
}
