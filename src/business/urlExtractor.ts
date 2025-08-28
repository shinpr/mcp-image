/**
 * URL extraction logic for processing URLs in prompts
 * Provides functionality to extract, validate, and manipulate URLs in text
 */

import { Err, Ok, type Result } from '../types/result'
import { InvalidUrlError } from '../utils/errors'

/**
 * Enhanced regular expression pattern for matching HTTP and HTTPS URLs
 * Supports complex URLs with query parameters, fragments, and various domains
 * More precise pattern to avoid false positives
 */
const URL_PATTERN = /https?:\/\/(?:[-\w.])+(?:\.[a-zA-Z]{2,})+(?:\/[-\w._~:/?#[\]@!$&'()*+,;=]*)?/g

/**
 * Maximum number of URLs to extract (performance consideration)
 */
const MAX_URLS = 10

/**
 * Extract URLs from a given prompt text
 * @param prompt The text to extract URLs from
 * @returns Array of unique URLs found in the prompt (max 10)
 */
export function extractUrls(prompt: string): string[] {
  const matches = prompt.match(URL_PATTERN)
  if (!matches) {
    return []
  }

  // Remove duplicates using Set and limit to MAX_URLS
  const uniqueUrls = [...new Set(matches)]
  return uniqueUrls.slice(0, MAX_URLS)
}

/**
 * Check if the prompt contains any URLs
 * @param prompt The text to check for URLs
 * @returns True if URLs are found, false otherwise
 */
export function hasUrls(prompt: string): boolean {
  return extractUrls(prompt).length > 0
}

/**
 * Remove all URLs from the prompt text
 * @param prompt The text to remove URLs from
 * @returns The prompt with URLs removed and extra spaces trimmed
 */
export function removeUrls(prompt: string): string {
  return prompt.replace(URL_PATTERN, '').replace(/\s+/g, ' ').trim()
}

/**
 * Validate a single URL using built-in URL constructor
 * @param url The URL string to validate
 * @returns Result containing validation success or error
 */
export function validateUrl(url: string): Result<string, InvalidUrlError> {
  try {
    const urlObj = new URL(url)

    // Only allow HTTP and HTTPS protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return Err(
        new InvalidUrlError(
          `Invalid protocol: ${urlObj.protocol}`,
          'Only HTTP and HTTPS URLs are supported',
          url
        )
      )
    }

    // Basic hostname validation
    if (!urlObj.hostname || urlObj.hostname.length === 0) {
      return Err(
        new InvalidUrlError('Invalid hostname in URL', 'URL must have a valid hostname', url)
      )
    }

    return Ok(url)
  } catch (error) {
    return Err(
      new InvalidUrlError(`Malformed URL: ${url}`, 'Please check the URL format and try again', url)
    )
  }
}

/**
 * Extract and validate URLs from prompt with detailed error reporting
 * @param prompt The text to extract URLs from
 * @returns Result containing valid URLs or validation error
 */
export function extractValidUrls(prompt: string): Result<string[], InvalidUrlError> {
  const extractedUrls = extractUrls(prompt)
  const validUrls: string[] = []
  const errors: InvalidUrlError[] = []

  for (const url of extractedUrls) {
    const validation = validateUrl(url)
    if (validation.success) {
      validUrls.push(validation.data)
    } else {
      errors.push(validation.error)
    }
  }

  // If there are validation errors and no valid URLs, return first error
  if (errors.length > 0 && validUrls.length === 0) {
    const firstError = errors[0]
    if (firstError) {
      return Err(firstError)
    }
  }

  return Ok(validUrls)
}

/**
 * Get URL statistics for analysis
 * @param prompt The text to analyze
 * @returns Statistics about URLs in the prompt
 */
export function getUrlStats(prompt: string): {
  totalFound: number
  validUrls: number
  httpUrls: number
  httpsUrls: number
  uniqueDomains: string[]
} {
  const urls = extractUrls(prompt)
  const httpUrls = urls.filter((url) => url.startsWith('http:')).length
  const httpsUrls = urls.filter((url) => url.startsWith('https:')).length

  const domains = urls
    .map((url) => {
      try {
        return new URL(url).hostname
      } catch {
        return null
      }
    })
    .filter((domain): domain is string => domain !== null)

  const uniqueDomains = [...new Set(domains)]

  return {
    totalFound: urls.length,
    validUrls: domains.length,
    httpUrls,
    httpsUrls,
    uniqueDomains,
  }
}

/**
 * URL extractor utilities - backward compatibility object
 */
export const URLExtractor = {
  extractUrls,
  hasUrls,
  removeUrls,
  validateUrl,
  extractValidUrls,
  getUrlStats,
}
