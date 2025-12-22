import type { StyleOptions } from './style-injector'

/**
 * Generate RTL CSS styles based on options
 */
export function generateRTLStyles(options: StyleOptions): string {
  const { mode, fontFamily, fontSize, lineHeight, targets } = options

  const selectors = targets.length > 0
    ? targets.join(',\n')
    : getDefaultSelectors()

  const fontStyles = buildFontStyles(fontFamily, fontSize, lineHeight)
  const directionStyles = buildDirectionStyles(mode)

  return `
/* RTL Agent - Auto-generated styles */
/* Mode: ${mode} */

/* Base styles for all targeted elements */
${selectors} {
  ${fontStyles}
  ${directionStyles}
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* Code blocks should always be LTR */
${selectors} pre,
${selectors} code,
${selectors} .code-block,
${selectors} [class*="code"] {
  direction: ltr !important;
  text-align: left !important;
  unicode-bidi: isolate;
}

/* Lists should inherit direction properly */
${selectors} ul,
${selectors} ol {
  padding-inline-start: 2em;
  padding-inline-end: 0;
}

/* Streaming text optimization */
${selectors} [data-streaming="true"],
${selectors} .streaming,
${selectors} .typing {
  direction: inherit;
  unicode-bidi: plaintext;
}

/* Agent-specific selectors */
.agent-view,
.chat-view,
.copilot-view,
[class*="agent"],
[class*="chat"],
[class*="copilot"] {
  ${fontStyles}
  ${directionStyles}
}

/* Message containers */
.message,
.chat-message,
.agent-message,
.response,
.agent-response,
[class*="message"] {
  ${directionStyles}
  unicode-bidi: plaintext;
}

/* Markdown content */
.markdown-body,
.markdown-content,
.rendered-markdown,
[class*="markdown"] {
  ${fontStyles}
  ${directionStyles}
}

/* Input areas */
.chat-input,
.agent-input,
.message-input,
[class*="input"] textarea {
  ${directionStyles}
  unicode-bidi: plaintext;
}

${mode === 'auto' ? getAutoDetectionStyles(selectors) : ''}
`.trim()
}

/**
 * Get default CSS selectors for agent panels
 */
function getDefaultSelectors(): string {
  return `
.chat-message,
.agent-response,
.markdown-body,
.message-content,
.chat-content,
.response-content,
[class*="chat"],
[class*="agent"],
[class*="message"],
[class*="response"],
[class*="copilot"]
`.trim()
}

/**
 * Build font-related CSS styles
 */
function buildFontStyles(fontFamily: string, fontSize: number, lineHeight: number): string {
  const styles: string[] = []

  if (fontFamily) {
    styles.push(`font-family: "${fontFamily}", "Vazirmatn", "IRANSansX", "Tahoma", sans-serif !important;`)
  }
  else {
    styles.push(`font-family: "Vazirmatn", "IRANSansX", "Tahoma", var(--vscode-font-family), sans-serif;`)
  }

  if (fontSize > 0) {
    styles.push(`font-size: ${fontSize}px !important;`)
  }

  styles.push(`line-height: ${lineHeight} !important;`)

  return styles.join('\n  ')
}

/**
 * Build direction-related CSS styles
 */
function buildDirectionStyles(mode: 'auto' | 'rtl' | 'ltr'): string {
  switch (mode) {
    case 'rtl':
      return `
  direction: rtl !important;
  text-align: right !important;
  unicode-bidi: embed;
`.trim()

    case 'ltr':
      return `
  direction: ltr !important;
  text-align: left !important;
  unicode-bidi: embed;
`.trim()

    case 'auto':
    default:
      return `
  direction: auto;
  text-align: start;
  unicode-bidi: plaintext;
`.trim()
  }
}

/**
 * Generate auto-detection styles using CSS :lang()
 */
function getAutoDetectionStyles(selectors: string): string {
  return `
/* Auto-detection for RTL languages */
${selectors}:lang(fa),
${selectors}:lang(ar),
${selectors}:lang(he),
${selectors}:lang(ur),
${selectors}:lang(ps) {
  direction: rtl !important;
  text-align: right !important;
}

${selectors}[dir="rtl"],
${selectors}.rtl,
${selectors}[data-direction="rtl"] {
  direction: rtl !important;
  text-align: right !important;
}
`.trim()
}

/**
 * RTL character detection regex
 * Matches Persian, Arabic, Hebrew characters
 */
export const RTL_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF\uFB1D-\uFB4F]/g

/**
 * Check if text is primarily RTL
 */
export function isRTLText(text: string): boolean {
  if (!text || text.length === 0)
    return false

  const matches = text.match(RTL_CHAR_REGEX)
  const rtlChars = matches ? matches.length : 0
  const totalChars = text.replace(/\s/g, '').length

  // If more than 30% RTL characters, consider it RTL
  return totalChars > 0 && (rtlChars / totalChars) > 0.3
}

/**
 * Get dominant text direction
 */
export function getTextDirection(text: string): 'rtl' | 'ltr' {
  return isRTLText(text) ? 'rtl' : 'ltr'
}
