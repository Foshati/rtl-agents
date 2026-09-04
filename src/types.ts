/** RTL injection mode */
export type RtlMode = 'inactive' | 'active'

/** A single workbench HTML document that must be patched */
export interface WorkbenchTarget {
  /** File name, e.g. `workbench.html` or `workbench-jetski-agent.html` */
  label: string
  /** Full path to the HTML file */
  htmlPath: string
  /** Checksum key inside `product.json` (posix path relative to `out/`) */
  checksumKey: string
  /** Directory the CSS/JS assets are written to */
  assetDir: string
}

/** Represents a discovered IDE installation with workbench files */
export interface IdeInstallation {
  /** IDE display name from vscode.env.appName */
  ideName: string
  /** Root of the unpacked app (vscode.env.appRoot) */
  appRoot: string
  /** Full path to product.json */
  productJsonPath: string
  /** Every workbench HTML document that hosts a chat surface */
  targets: WorkbenchTarget[]
  /** Primary workbench.html — used for permission hints and messages */
  workbenchHtmlPath: string
  /** Directory holding the injected assets */
  workbenchDir: string
}

/** Per-target record stored in the patch manifest */
export interface TargetManifest {
  htmlPath: string
  /** sha256 of the pristine (unpatched) HTML for this IDE build */
  originalHash: string
}

/**
 * Written next to the injected assets so `removeRtl` can tell a valid backup
 * from a stale one left behind by an older IDE build.
 */
export interface PatchManifest {
  extensionVersion: string
  ideName: string
  targets: TargetManifest[]
}

/** RTL installation status for a single IDE */
export interface RtlStatus {
  installation: IdeInstallation
  /** Whether at least one target is patched */
  isInstalled: boolean
  /** How many targets carry the patch */
  patchedTargets: number
  /** How many targets were discovered */
  totalTargets: number
  /** Whether any workbench HTML backup exists */
  htmlBackupExists: boolean
  /** Whether product.json.bak exists */
  productBackupExists: boolean
}

/**
 * Base direction applied to rendered chat text.
 *
 * `rtl` pins every message block to an RTL base, which is what a Persian,
 * Arabic or Hebrew conversation wants. `auto` restores the pre-2.1 behaviour of
 * letting each paragraph pick its own direction from its first strong character
 * — better only when the chat is mostly LTR with occasional RTL passages.
 */
export type BaseDirection = 'rtl' | 'auto'

/** Options that shape the generated CSS/JS assets */
export interface ContentOptions {
  /** Extra container selectors supplied by the user */
  customSelectors: string[]
  /** Base direction for rendered message text */
  baseDirection: BaseDirection
}

/** Options for a patch operation */
export interface PatchOptions extends ContentOptions {
  extensionVersion: string
}

/** Result of a patch/unpatch operation */
export interface PatchResult {
  messages: string[]
  changed: boolean
  permissionError: boolean
}
