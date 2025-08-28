/**
 * Tests for URL extraction logic
 * Following TDD Red-Green-Refactor approach
 */

import { describe, expect, it } from 'vitest'
import { URLExtractor } from '../urlExtractor'

describe('URLExtractor', () => {
  describe('extractUrls', () => {
    it('should extract single URL from prompt', () => {
      const prompt = 'Check https://example.com for details'
      const urls = URLExtractor.extractUrls(prompt)

      expect(urls).toEqual(['https://example.com'])
    })

    it('should extract multiple URLs from prompt', () => {
      const prompt = 'Visit https://site1.com and https://site2.com for more info'
      const urls = URLExtractor.extractUrls(prompt)

      expect(urls).toEqual(['https://site1.com', 'https://site2.com'])
    })

    it('should return empty array when no URLs in prompt', () => {
      const prompt = 'Simple text without any links'
      const urls = URLExtractor.extractUrls(prompt)

      expect(urls).toEqual([])
    })

    it('should filter out invalid URLs', () => {
      const prompt = 'Check htp://invalid-url or malformed links'
      const urls = URLExtractor.extractUrls(prompt)

      expect(urls).toEqual([])
    })

    it('should extract both HTTP and HTTPS URLs', () => {
      const prompt = 'Visit http://example.com and https://secure.com'
      const urls = URLExtractor.extractUrls(prompt)

      expect(urls).toEqual(['http://example.com', 'https://secure.com'])
    })

    it('should remove duplicate URLs', () => {
      const prompt = 'Check https://example.com and https://example.com again'
      const urls = URLExtractor.extractUrls(prompt)

      expect(urls).toEqual(['https://example.com'])
    })

    it('should handle complex URLs with query parameters', () => {
      const prompt = 'Visit https://example.com/path?param=value&other=test#section'
      const urls = URLExtractor.extractUrls(prompt)

      expect(urls).toEqual(['https://example.com/path?param=value&other=test#section'])
    })

    it('should limit to maximum 10 URLs', () => {
      const urls = Array.from({ length: 15 }, (_, i) => `https://site${i}.com`).join(' ')
      const prompt = `Visit these sites: ${urls}`
      const extractedUrls = URLExtractor.extractUrls(prompt)

      expect(extractedUrls.length).toBeLessThanOrEqual(10)
    })
  })

  describe('hasUrls', () => {
    it('should return true when URLs are present', () => {
      const prompt = 'Check https://example.com for details'
      const hasUrls = URLExtractor.hasUrls(prompt)

      expect(hasUrls).toBe(true)
    })

    it('should return false when no URLs are present', () => {
      const prompt = 'Simple text without any links'
      const hasUrls = URLExtractor.hasUrls(prompt)

      expect(hasUrls).toBe(false)
    })
  })

  describe('removeUrls', () => {
    it('should remove URLs from prompt', () => {
      const prompt = 'Check https://example.com for details'
      const cleanPrompt = URLExtractor.removeUrls(prompt)

      expect(cleanPrompt).toBe('Check for details')
    })

    it('should return original text when no URLs present', () => {
      const prompt = 'Simple text without any links'
      const cleanPrompt = URLExtractor.removeUrls(prompt)

      expect(cleanPrompt).toBe(prompt)
    })

    it('should handle multiple URLs removal', () => {
      const prompt = 'Visit https://site1.com and https://site2.com for info'
      const cleanPrompt = URLExtractor.removeUrls(prompt)

      expect(cleanPrompt).toBe('Visit and for info')
    })
  })
})
