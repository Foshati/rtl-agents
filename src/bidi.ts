/**
 * Direction primitives shared by the injected runtime and the test suite.
 *
 * The runtime cannot import modules — it is a plain script loaded from workbench
 * HTML — so the pure functions here are serialised into it with `toString()`.
 * That keeps one implementation: the code under test is the code that ships.
 * Functions meant for serialisation must stay self-contained: literals only, no
 * references to anything outside their own body.
 */

export type Dir = 'rtl' | 'ltr'

export type CodeRange = readonly [number, number]

/** Bidi class L — Latin, Latin Extended, Greek and Cyrillic letters. */
export const STRONG_LTR_RANGES: readonly CodeRange[] = [
  [0x0041, 0x005A], // A-Z
  [0x0061, 0x007A], // a-z
  [0x00C0, 0x024F], // Latin-1 Supplement + Latin Extended-A/B
  [0x0370, 0x03FF], // Greek
  [0x0400, 0x04FF], // Cyrillic
]

/**
 * Bidi classes R and AL — Hebrew and Arabic letters, including the Persian
 * additions (پ چ ژ گ ک ی) that live in U+066E-U+06D3, plus presentation forms.
 *
 * The gaps matter as much as the ranges. Both digit blocks are absent —
 * U+0660-U+0669 are AN and U+06F0-U+06F9 are EN, neither of them strong — and so
 * is Arabic punctuation (U+060C, U+061B, U+061F). The presentation forms stop at
 * U+FEFC because U+FEFF is a zero-width no-break space rather than a letter.
 */
export const STRONG_RTL_RANGES: readonly CodeRange[] = [
  [0x05D0, 0x05EA], // Hebrew letters
  [0x05EF, 0x05F2], // Hebrew ligatures
  [0x0620, 0x064A], // Arabic letters
  [0x066E, 0x06D3], // Arabic letters incl. Persian
  [0x06D5, 0x06D5],
  [0x06E5, 0x06E6],
  [0x06EE, 0x06EF],
  [0x06FA, 0x06FF],
  [0x0750, 0x077F], // Arabic Supplement
  [0x08A0, 0x08BD], // Arabic Extended-A
  [0xFB1D, 0xFB4F], // Hebrew presentation forms
  [0xFB50, 0xFDFD], // Arabic presentation forms A
  [0xFE70, 0xFEFC], // Arabic presentation forms B
]

function escapeCodePoint(codePoint: number): string {
  return `\\u${codePoint.toString(16).toUpperCase().padStart(4, '0')}`
}

/**
 * Regex character-class source for a set of ranges, written with `\uXXXX`
 * escapes so the generated runtime stays ASCII-only.
 */
export function rangesToClass(ranges: readonly CodeRange[]): string {
  const parts = ranges.map(([low, high]) =>
    low === high ? escapeCodePoint(low) : `${escapeCodePoint(low)}-${escapeCodePoint(high)}`,
  )
  return `[${parts.join('')}]`
}

const RTL_LETTER = new RegExp(rangesToClass(STRONG_RTL_RANGES), 'g')
const LTR_LETTER = new RegExp(rangesToClass(STRONG_LTR_RANGES), 'g')

/** Count strong RTL and LTR letters in a string. */
export function countStrong(text: string): [rtl: number, ltr: number] {
  return [text.match(RTL_LETTER)?.length ?? 0, text.match(LTR_LETTER)?.length ?? 0]
}

/** The direction first-strong resolution (Unicode BiDi P2/P3) would pick. */
export function firstStrongDirection(text: string): Dir | 'neutral' {
  RTL_LETTER.lastIndex = 0
  LTR_LETTER.lastIndex = 0
  const rtl = RTL_LETTER.exec(text)?.index ?? Infinity
  const ltr = LTR_LETTER.exec(text)?.index ?? Infinity
  RTL_LETTER.lastIndex = 0
  LTR_LETTER.lastIndex = 0
  if (rtl === Infinity && ltr === Infinity) {
    return 'neutral'
  }
  return rtl < ltr ? 'rtl' : 'ltr'
}

/**
 * Decide a message's direction from its strong-letter counts.
 *
 * Unlike first-strong resolution this weighs the whole message, so a Persian
 * reply that opens with `API` or `npm install` is still RTL.
 *
 * `lean` is the direction the message already shows — or, before it shows any,
 * the direction the conversation settled into. Leaving it takes real evidence:
 * Persian technical prose is dense with Latin terms, and a ratio alone dips below
 * any threshold mid-sentence (`PostgreSQL با Drizzle ORM …` is 9% Persian after
 * four words, 56% by the end). Leaning on the shown direction is what keeps a
 * streaming reply from flipping back and forth.
 *
 * Serialised into the runtime: keep it self-contained.
 */
export function decideDirection(rtl: number, ltr: number, lean: Dir | null): Dir | null {
  const total = rtl + ltr
  if (total === 0) {
    return lean
  }
  if (lean === 'rtl') {
    if (rtl === 0) {
      return ltr >= 12 ? 'ltr' : 'rtl'
    }
    if (total < 60) {
      return 'rtl'
    }
    return rtl / total >= 0.2 ? 'rtl' : 'ltr'
  }
  if (total < 20) {
    return rtl > ltr ? 'rtl' : 'ltr'
  }
  return rtl / total >= 0.3 ? 'rtl' : 'ltr'
}

/**
 * Whether a decision has enough evidence to stop re-evaluating. A settled RTL
 * message never flips back, however much English it quotes further down; the bar
 * is high enough that a Persian greeting opening an English reply does not count.
 *
 * Serialised into the runtime: keep it self-contained.
 */
export function isSettled(dir: Dir, rtl: number, ltr: number): boolean {
  const total = rtl + ltr
  if (dir === 'rtl') {
    return rtl >= 24 && rtl / total >= 0.3
  }
  return rtl === 0 && ltr >= 80
}
