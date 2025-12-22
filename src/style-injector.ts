import { generateRTLStyles } from './styles'

export interface StyleOptions {
  mode: 'auto' | 'rtl' | 'ltr'
  fontFamily: string
  fontSize: number
  lineHeight: number
  targets: string[]
}

/**
 * RTL Style Injector
 * Injects CSS styles into VS Code webviews for RTL support
 */
export class RTLStyleInjector {
  private isApplied = false

  /**
   * Apply RTL styles to VS Code
   */
  applyStyles(options: StyleOptions): void {
    const styles = generateRTLStyles(options)
    this.injectGlobalStyles(styles)
    this.isApplied = true
  }

  /**
   * Remove injected styles
   */
  removeStyles(): void {
    if (!this.isApplied)
      return

    this.removeGlobalStyles()
    this.isApplied = false
  }

  /**
   * Inject styles globally
   */
  private injectGlobalStyles(css: string): void {
    // Store styles in global state for webview access
    (globalThis as any).__rtlAgentStyles = css
    this.notifyWebviews(css)
  }

  /**
   * Remove global styles
   */
  private removeGlobalStyles(): void {
    (globalThis as any).__rtlAgentStyles = undefined
    this.notifyWebviews('')
  }

  /**
   * Notify webviews of style changes
   */
  private notifyWebviews(css: string): void {
    const message = {
      type: 'rtl-agent:styles',
      styles: css,
    }
    ;(globalThis as any).__rtlAgentMessage = message
  }

  /**
   * Get current styles (for webviews to query)
   */
  static getStyles(): string {
    return (globalThis as any).__rtlAgentStyles || ''
  }
}
