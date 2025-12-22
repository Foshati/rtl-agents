import { beforeEach, describe, expect, it } from 'vitest'
import { RTLStyleInjector } from '../src/style-injector'

describe('rTLStyleInjector', () => {
  let injector: RTLStyleInjector

  beforeEach(() => {
    // Clean up global state
    ;(globalThis as any).__rtlAgentStyles = undefined
    ;(globalThis as any).__rtlAgentMessage = undefined
    injector = new RTLStyleInjector()
  })

  describe('applyStyles()', () => {
    it('should store styles globally', () => {
      injector.applyStyles({
        mode: 'rtl',
        fontFamily: '',
        fontSize: 0,
        lineHeight: 1.6,
        targets: [],
      })

      const styles = RTLStyleInjector.getStyles()
      expect(styles).toContain('direction: rtl')
    })

    it('should set message for webviews', () => {
      injector.applyStyles({
        mode: 'auto',
        fontFamily: '',
        fontSize: 0,
        lineHeight: 1.6,
        targets: [],
      })

      const message = (globalThis as any).__rtlAgentMessage
      expect(message).toBeDefined()
      expect(message.type).toBe('rtl-agents:styles')
      expect(message.styles).toBeTruthy()
    })
  })

  describe('removeStyles()', () => {
    it('should clear global styles', () => {
      injector.applyStyles({
        mode: 'rtl',
        fontFamily: '',
        fontSize: 0,
        lineHeight: 1.6,
        targets: [],
      })

      injector.removeStyles()

      const styles = RTLStyleInjector.getStyles()
      expect(styles).toBe('')
    })

    it('should not throw if called without applying', () => {
      expect(() => injector.removeStyles()).not.toThrow()
    })
  })

  describe('getStyles()', () => {
    it('should return empty string when no styles applied', () => {
      expect(RTLStyleInjector.getStyles()).toBe('')
    })

    it('should return applied styles', () => {
      injector.applyStyles({
        mode: 'rtl',
        fontFamily: 'Vazirmatn',
        fontSize: 14,
        lineHeight: 1.5,
        targets: ['.test'],
      })

      const styles = RTLStyleInjector.getStyles()
      expect(styles).toContain('Vazirmatn')
      expect(styles).toContain('font-size: 14px')
      expect(styles).toContain('line-height: 1.5')
      expect(styles).toContain('.test')
    })
  })
})
