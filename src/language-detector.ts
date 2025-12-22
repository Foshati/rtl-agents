/**
 * Language Detector
 * Detects RTL languages and provides direction information
 */

export type Language = 'persian' | 'arabic' | 'hebrew' | 'urdu' | 'other-rtl' | 'ltr'

export interface DetectionResult {
  language: Language
  direction: 'rtl' | 'ltr'
  confidence: number
  rtlPercentage: number
}

/**
 * RTL Unicode ranges
 */
const RTL_RANGES = {
  arabic: { basic: [0x0600, 0x06FF], supplement: [0x0750, 0x077F] },
  hebrew: { basic: [0x0590, 0x05FF] },
}

const PERSIAN_CHARS = 'پچژگکیءآأؤإئابةتثجحخدذرزسشصضطظعغفقلمنهوىي'

/**
 * Language Detector class
 */
export class LanguageDetector {
  private cache = new Map<string, DetectionResult>()

  /**
   * Detect language and direction of text
   */
  detect(text: string): DetectionResult {
    if (!text || text.trim().length === 0) {
      return { language: 'ltr', direction: 'ltr', confidence: 1, rtlPercentage: 0 }
    }

    const cacheKey = text.slice(0, 100)
    const cached = this.cache.get(cacheKey)
    if (cached)
      return cached

    const result = this.analyzeText(text)

    if (this.cache.size >= 1000) {
      const firstKey = this.cache.keys().next().value
      if (firstKey)
        this.cache.delete(firstKey)
    }
    this.cache.set(cacheKey, result)

    return result
  }

  /**
   * Analyze text for language detection
   */
  private analyzeText(text: string): DetectionResult {
    const stats = this.getCharacterStats(text)
    const rtlPercentage = stats.totalChars > 0 ? stats.rtlChars / stats.totalChars : 0

    let language: Language = 'ltr'
    let confidence = 0

    if (rtlPercentage > 0.3) {
      if (stats.persianChars > 0) {
        language = 'persian'
        confidence = Math.min(0.9, rtlPercentage + 0.1)
      }
      else if (stats.hebrewChars > stats.arabicChars) {
        language = 'hebrew'
        confidence = Math.min(0.9, rtlPercentage + 0.1)
      }
      else if (stats.arabicChars > 0) {
        language = 'arabic'
        confidence = Math.min(0.9, rtlPercentage + 0.1)
      }
      else {
        language = 'other-rtl'
        confidence = rtlPercentage
      }
    }
    else {
      language = 'ltr'
      confidence = 1 - rtlPercentage
    }

    return {
      language,
      direction: rtlPercentage > 0.3 ? 'rtl' : 'ltr',
      confidence,
      rtlPercentage,
    }
  }

  /**
   * Get character statistics
   */
  private getCharacterStats(text: string) {
    let totalChars = 0
    let rtlChars = 0
    let arabicChars = 0
    let persianChars = 0
    let hebrewChars = 0

    for (const char of text) {
      if (/\s/.test(char) || /[.,;:!?'"()\[\]{}]/.test(char))
        continue

      totalChars++
      const code = char.charCodeAt(0)

      if (code >= RTL_RANGES.arabic.basic[0] && code <= RTL_RANGES.arabic.basic[1]) {
        rtlChars++
        arabicChars++
        if (PERSIAN_CHARS.includes(char))
          persianChars++
      }

      if (code >= RTL_RANGES.hebrew.basic[0] && code <= RTL_RANGES.hebrew.basic[1]) {
        rtlChars++
        hebrewChars++
      }
    }

    return { totalChars, rtlChars, arabicChars, persianChars, hebrewChars }
  }

  /**
   * Quick check if text is RTL
   */
  isRTL(text: string): boolean {
    return this.detect(text).direction === 'rtl'
  }

  /**
   * Get recommended CSS direction
   */
  getCSSDirection(text: string): 'rtl' | 'ltr' | 'auto' {
    const result = this.detect(text)
    return result.confidence > 0.7 ? result.direction : 'auto'
  }

  /**
   * Clear detection cache
   */
  clearCache(): void {
    this.cache.clear()
  }
}

export const languageDetector = new LanguageDetector()
