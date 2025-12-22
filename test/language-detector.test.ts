import { describe, it, expect, beforeEach } from 'vitest'
import { LanguageDetector } from '../src/language-detector'

describe('LanguageDetector', () => {
  let detector: LanguageDetector

  beforeEach(() => {
    detector = new LanguageDetector()
  })

  describe('detect()', () => {
    it('should detect Persian text as RTL', () => {
      const result = detector.detect('سلام، این یک متن فارسی است')
      expect(result.direction).toBe('rtl')
      expect(result.language).toBe('persian')
      expect(result.confidence).toBeGreaterThan(0.5)
    })

    it('should detect Arabic/Persian script text as RTL', () => {
      const result = detector.detect('مرحبا، هذا نص عربي')
      expect(result.direction).toBe('rtl')
      // Both Arabic and Persian share many characters, so detection may vary
      expect(['arabic', 'persian']).toContain(result.language)
    })

    it('should detect Hebrew text as RTL', () => {
      const result = detector.detect('שלום, זה טקסט בעברית')
      expect(result.direction).toBe('rtl')
      expect(result.language).toBe('hebrew')
    })

    it('should detect English text as LTR', () => {
      const result = detector.detect('Hello, this is an English text')
      expect(result.direction).toBe('ltr')
      expect(result.language).toBe('ltr')
    })

    it('should handle empty string', () => {
      const result = detector.detect('')
      expect(result.direction).toBe('ltr')
      expect(result.confidence).toBe(1)
    })

    it('should handle whitespace only', () => {
      const result = detector.detect('   \n\t  ')
      expect(result.direction).toBe('ltr')
    })

    it('should handle mixed content with majority RTL', () => {
      const result = detector.detect('سلام! Hello به VS Code خوش آمدید')
      expect(result.direction).toBe('rtl')
    })

    it('should handle mixed content with majority LTR', () => {
      const result = detector.detect('Hello world! سلام - This is a test')
      expect(result.direction).toBe('ltr')
    })

    it('should detect code blocks as LTR', () => {
      const result = detector.detect('const x = 5; function test() {}')
      expect(result.direction).toBe('ltr')
    })
  })

  describe('isRTL()', () => {
    it('should return true for Persian text', () => {
      expect(detector.isRTL('این متن فارسی است')).toBe(true)
    })

    it('should return false for English text', () => {
      expect(detector.isRTL('This is English')).toBe(false)
    })

    it('should return false for numbers only', () => {
      expect(detector.isRTL('12345')).toBe(false)
    })
  })

  describe('getCSSDirection()', () => {
    it('should return rtl for Persian text', () => {
      expect(detector.getCSSDirection('متن فارسی')).toBe('rtl')
    })

    it('should return ltr for English text', () => {
      expect(detector.getCSSDirection('English text')).toBe('ltr')
    })

    it('should handle ambiguous text', () => {
      const result = detector.getCSSDirection('a b c د')
      expect(['auto', 'ltr', 'rtl']).toContain(result)
    })
  })

  describe('cache behavior', () => {
    it('should cache results for repeated queries', () => {
      const text = 'سلام و خوش آمدید'
      const result1 = detector.detect(text)
      const result2 = detector.detect(text)
      expect(result1).toEqual(result2)
    })

    it('should clear cache', () => {
      detector.detect('سلام')
      detector.clearCache()
      // No error should occur
      const result = detector.detect('سلام')
      expect(result.direction).toBe('rtl')
    })
  })

  describe('edge cases', () => {
    it('should handle special characters', () => {
      const result = detector.detect('سلام! @#$%^&*() درود')
      expect(result.direction).toBe('rtl')
    })

    it('should handle URLs in RTL text', () => {
      const result = detector.detect('برای اطلاعات بیشتر به https://example.com مراجعه کنید')
      expect(result.direction).toBe('rtl')
    })

    it('should handle emojis', () => {
      const result = detector.detect('سلام 👋 چطوری؟ 😊')
      expect(result.direction).toBe('rtl')
    })

    it('should handle numbers in RTL text', () => {
      const result = detector.detect('قیمت: ۱۲۳۴۵ تومان')
      expect(result.direction).toBe('rtl')
    })
  })
})
