/**
 * Edge case tests for URL extraction as specified in task requirements
 * Testing specific scenarios for L2 confirmation
 */

import { describe, expect, it } from 'vitest'
import { URLExtractor } from '../urlExtractor'

describe('URLExtractor Edge Cases (Task Requirements)', () => {
  describe('URL extraction patterns', () => {
    it('should extract single URL: "Check https://example.com for details"', () => {
      const prompt = 'Check https://example.com for details'
      const urls = URLExtractor.extractUrls(prompt)

      expect(urls).toEqual(['https://example.com'])
    })

    it('should extract multiple URLs: "Visit https://site1.com and https://site2.com"', () => {
      const prompt = 'Visit https://site1.com and https://site2.com'
      const urls = URLExtractor.extractUrls(prompt)

      expect(urls).toEqual(['https://site1.com', 'https://site2.com'])
    })

    it('should handle URL-free text: "Simple text without any links"', () => {
      const prompt = 'Simple text without any links'
      const urls = URLExtractor.extractUrls(prompt)

      expect(urls).toEqual([])
      expect(URLExtractor.hasUrls(prompt)).toBe(false)
    })

    it('should filter invalid URL: "Check htp://invalid-url or malformed links"', () => {
      const prompt = 'Check htp://invalid-url or malformed links'
      const urls = URLExtractor.extractUrls(prompt)

      expect(urls).toEqual([])
      expect(URLExtractor.hasUrls(prompt)).toBe(false)
    })
  })

  describe('URL processing requirements', () => {
    it('should support both HTTP and HTTPS protocols', () => {
      const prompt = 'Test http://example.com and https://secure.com'
      const urls = URLExtractor.extractUrls(prompt)

      expect(urls).toHaveLength(2)
      expect(urls).toContain('http://example.com')
      expect(urls).toContain('https://secure.com')
    })

    it('should handle duplicate URL removal', () => {
      const prompt = 'Visit https://test.com then https://test.com again'
      const urls = URLExtractor.extractUrls(prompt)

      expect(urls).toEqual(['https://test.com'])
    })

    it('should enforce maximum URL limit of 10', () => {
      const manyUrls = Array.from({ length: 15 }, (_, i) => `https://site${i}.com`).join(' ')
      const prompt = `Visit these sites: ${manyUrls}`
      const urls = URLExtractor.extractUrls(prompt)

      expect(urls.length).toBeLessThanOrEqual(10)
      expect(urls.length).toBe(10)
    })
  })

  describe('enhanced validation methods', () => {
    it('should validate URLs correctly with Result type', () => {
      const validUrl = 'https://example.com'
      const result = URLExtractor.validateUrl(validUrl)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(validUrl)
      }
    })

    it('should reject invalid protocol URLs', () => {
      const invalidUrl = 'ftp://example.com'
      const result = URLExtractor.validateUrl(invalidUrl)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_URL_ERROR')
        expect(result.error.message).toContain('Invalid protocol')
      }
    })

    it('should extract valid URLs only', () => {
      const prompt = 'Visit https://valid.com and ftp://invalid.com'
      const result = URLExtractor.extractValidUrls(prompt)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(['https://valid.com'])
      }
    })
  })

  describe('URL statistics', () => {
    it('should provide comprehensive URL statistics', () => {
      const prompt = 'Visit https://secure.com and http://example.com and https://test.com'
      const stats = URLExtractor.getUrlStats(prompt)

      expect(stats.totalFound).toBe(3)
      expect(stats.validUrls).toBe(3)
      expect(stats.httpsUrls).toBe(2)
      expect(stats.httpUrls).toBe(1)
      expect(stats.uniqueDomains).toHaveLength(3)
      expect(stats.uniqueDomains).toEqual(['secure.com', 'example.com', 'test.com'])
    })
  })
})
