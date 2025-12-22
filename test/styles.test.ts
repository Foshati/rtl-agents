import { describe, it, expect } from 'vitest'
import { generateRTLStyles, isRTLText, getTextDirection } from '../src/styles'

describe('styles', () => {
  describe('generateRTLStyles()', () => {
    it('should generate RTL styles when mode is rtl', () => {
      const styles = generateRTLStyles({
        mode: 'rtl',
        fontFamily: '',
        fontSize: 0,
        lineHeight: 1.6,
        targets: [],
      })

      expect(styles).toContain('direction: rtl')
      expect(styles).toContain('text-align: right')
      expect(styles).toContain('Mode: rtl')
    })

    it('should generate LTR styles when mode is ltr', () => {
      const styles = generateRTLStyles({
        mode: 'ltr',
        fontFamily: '',
        fontSize: 0,
        lineHeight: 1.6,
        targets: [],
      })

      expect(styles).toContain('direction: ltr')
      expect(styles).toContain('text-align: left')
    })

    it('should generate auto styles when mode is auto', () => {
      const styles = generateRTLStyles({
        mode: 'auto',
        fontFamily: '',
        fontSize: 0,
        lineHeight: 1.6,
        targets: [],
      })

      expect(styles).toContain('direction: auto')
      expect(styles).toContain('unicode-bidi: plaintext')
      expect(styles).toContain(':lang(fa)')
      expect(styles).toContain(':lang(ar)')
      expect(styles).toContain(':lang(he)')
    })

    it('should include custom font family', () => {
      const styles = generateRTLStyles({
        mode: 'rtl',
        fontFamily: 'Vazirmatn',
        fontSize: 0,
        lineHeight: 1.6,
        targets: [],
      })

      expect(styles).toContain('Vazirmatn')
    })

    it('should include custom font size', () => {
      const styles = generateRTLStyles({
        mode: 'rtl',
        fontFamily: '',
        fontSize: 16,
        lineHeight: 1.6,
        targets: [],
      })

      expect(styles).toContain('font-size: 16px')
    })

    it('should include custom line height', () => {
      const styles = generateRTLStyles({
        mode: 'rtl',
        fontFamily: '',
        fontSize: 0,
        lineHeight: 1.8,
        targets: [],
      })

      expect(styles).toContain('line-height: 1.8')
    })

    it('should use custom targets', () => {
      const styles = generateRTLStyles({
        mode: 'rtl',
        fontFamily: '',
        fontSize: 0,
        lineHeight: 1.6,
        targets: ['.my-custom-class', '#my-id'],
      })

      expect(styles).toContain('.my-custom-class')
      expect(styles).toContain('#my-id')
    })

    it('should always make code blocks LTR', () => {
      const styles = generateRTLStyles({
        mode: 'rtl',
        fontFamily: '',
        fontSize: 0,
        lineHeight: 1.6,
        targets: [],
      })

      expect(styles).toContain('pre')
      expect(styles).toContain('code')
      expect(styles).toContain('direction: ltr !important')
    })

    it('should include streaming optimization', () => {
      const styles = generateRTLStyles({
        mode: 'auto',
        fontFamily: '',
        fontSize: 0,
        lineHeight: 1.6,
        targets: [],
      })

      expect(styles).toContain('streaming')
      expect(styles).toContain('unicode-bidi: plaintext')
    })
  })

  describe('RTL_CHAR_REGEX pattern', () => {
    // Test using the isRTLText function which uses the regex internally
    it('should detect Persian characters', () => {
      expect(isRTLText('سلام')).toBe(true)
      expect(isRTLText('پ')).toBe(true)
      expect(isRTLText('چ')).toBe(true)
    })

    it('should detect Arabic characters', () => {
      expect(isRTLText('مرحبا')).toBe(true)
    })

    it('should detect Hebrew characters', () => {
      expect(isRTLText('שלום')).toBe(true)
    })

    it('should not detect Latin characters as RTL', () => {
      expect(isRTLText('hello')).toBe(false)
    })

    it('should not detect numbers only as RTL', () => {
      expect(isRTLText('12345')).toBe(false)
    })
  })

  describe('isRTLText()', () => {
    it('should return true for RTL-majority text', () => {
      expect(isRTLText('سلام دنیا')).toBe(true)
    })

    it('should return false for LTR-majority text', () => {
      expect(isRTLText('Hello World')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isRTLText('')).toBe(false)
    })

    it('should handle mixed content', () => {
      expect(isRTLText('سلام Hello سلام سلام')).toBe(true)
      expect(isRTLText('Hello سلام World Test')).toBe(false)
    })
  })

  describe('getTextDirection()', () => {
    it('should return rtl for RTL text', () => {
      expect(getTextDirection('این متن فارسی است')).toBe('rtl')
    })

    it('should return ltr for LTR text', () => {
      expect(getTextDirection('This is English')).toBe('ltr')
    })
  })
})
