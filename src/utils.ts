import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'

/**
 * Check if a path exists (file or directory).
 */
export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  }
  catch {
    return false
  }
}

/**
 * sha256 of a string.
 */
export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex')
}

/**
 * sha256 of a file's contents, or `undefined` when it cannot be read.
 */
export async function hashFile(p: string): Promise<string | undefined> {
  try {
    return hashText(await fs.readFile(p, 'utf-8'))
  }
  catch {
    return undefined
  }
}

/**
 * True when the error looks like a filesystem permission failure.
 */
export function isPermissionError(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException | undefined)?.code
  return code === 'EPERM' || code === 'EACCES' || code === 'EROFS'
}
