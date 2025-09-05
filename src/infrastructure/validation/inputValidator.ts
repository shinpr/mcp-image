/**
 * Input Validator - Comprehensive input validation system
 * Handles edge cases, multi-language support, and secure input processing
 * Provides detailed validation results and normalization
 */

// Removed unused imports - Result, Err, Ok not used in this file
import type {
  ErrorSeverity,
  ValidationError,
  ValidationResult,
  ValidationSchema,
  ValidationWarning,
} from '../errorHandling/orchestrationErrorHandler'
import { ErrorSeverity as Severity } from '../errorHandling/orchestrationErrorHandler'

/**
 * Language detection result
 */
interface LanguageDetection {
  language: string
  confidence: number
  isSupported: boolean
}

/**
 * Content analysis result
 */
interface ContentAnalysis {
  appropriate: boolean
  message: string
  suggestedModifications?: string[]
  detectedLanguages: string[]
  hasSpecialCharacters: boolean
  encodingIssues: boolean
}

/**
 * Input validation item for detailed reporting
 */
interface ValidationItem {
  valid: boolean
  severity?: ErrorSeverity
  message?: string
  suggestion?: string
  metadata?: Record<string, unknown>
}

/**
 * Validation constants
 */
const VALIDATION_CONSTANTS = {
  MAX_PROMPT_LENGTH: 8000,
  MIN_PROMPT_LENGTH: 1,
  SUPPORTED_LANGUAGES: ['en', 'ja', 'zh', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru'],
  SPECIAL_CHAR_PATTERN: /[^\w\s\-.,!?'"():;]/g,
  UNSAFE_CONTENT_PATTERNS: [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload=/gi,
    /onerror=/gi,
  ],
} as const

/**
 * InputValidator implementation for comprehensive input validation
 */
export class InputValidator {
  private readonly supportedLanguages: Set<string>

  constructor() {
    this.supportedLanguages = new Set(VALIDATION_CONSTANTS.SUPPORTED_LANGUAGES)
  }

  /**
   * Validate prompt input with comprehensive edge case handling
   */
  async validatePromptInput(prompt: string): Promise<ValidationResult> {
    const validations = await Promise.all([
      this.validatePromptLength(prompt),
      this.validateCharacterSet(prompt),
      this.validateContent(prompt),
      this.detectPotentialIssues(prompt),
    ])

    return this.compileValidationResult(validations, prompt)
  }

  /**
   * Validate prompt length with appropriate error handling
   */
  private validatePromptLength(prompt: string): ValidationItem {
    const trimmedLength = prompt.trim().length

    if (trimmedLength === 0) {
      return {
        valid: false,
        severity: Severity.FATAL,
        message: 'Prompt cannot be empty',
        suggestion: 'Provide a descriptive prompt for image generation',
      }
    }

    if (trimmedLength < VALIDATION_CONSTANTS.MIN_PROMPT_LENGTH) {
      return {
        valid: false,
        severity: Severity.RECOVERABLE,
        message: 'Prompt is too short',
        suggestion: 'Provide a more detailed description for better results',
      }
    }

    if (prompt.length > VALIDATION_CONSTANTS.MAX_PROMPT_LENGTH) {
      return {
        valid: false, // This will be handled as a warning in compile method due to DEGRADED severity
        severity: Severity.DEGRADED,
        message: `Prompt exceeds recommended length (${VALIDATION_CONSTANTS.MAX_PROMPT_LENGTH} characters)`,
        suggestion: 'Consider shortening prompt for better processing',
        metadata: {
          actualLength: prompt.length,
          recommendedLength: VALIDATION_CONSTANTS.MAX_PROMPT_LENGTH,
        },
      }
    }

    return { valid: true }
  }

  /**
   * Validate character set and encoding
   */
  private validateCharacterSet(prompt: string): ValidationItem {
    // Check for encoding issues
    const encodingTest = prompt.includes('\uFFFD') // Unicode replacement character
    if (encodingTest) {
      return {
        valid: false,
        severity: Severity.RECOVERABLE,
        message: 'Text encoding issues detected',
        suggestion: 'Please ensure proper text encoding (UTF-8 recommended)',
      }
    }

    // Check for excessive special characters
    const specialCharMatches = prompt.match(VALIDATION_CONSTANTS.SPECIAL_CHAR_PATTERN)
    if (specialCharMatches && specialCharMatches.length > prompt.length * 0.3) {
      return {
        valid: false,
        severity: Severity.DEGRADED,
        message: 'Excessive special characters detected',
        suggestion: 'Reduce special characters for better processing',
      }
    }

    return { valid: true }
  }

  /**
   * Validate content for appropriateness and safety
   */
  private async validateContent(prompt: string): Promise<ValidationItem> {
    // Multi-language support validation
    const languageDetection = await this.detectLanguage(prompt)
    const contentAnalysis = await this.analyzeContent(prompt)

    if (!contentAnalysis.appropriate) {
      return {
        valid: false,
        severity: Severity.RECOVERABLE,
        message: contentAnalysis.message,
        suggestion: 'Please modify the prompt to follow content guidelines',
        metadata: {
          language: languageDetection.language,
          detectedIssues: contentAnalysis.suggestedModifications,
        },
      }
    }

    return {
      valid: true,
      metadata: {
        language: languageDetection.language,
        confidence: languageDetection.confidence,
        detectedLanguages: contentAnalysis.detectedLanguages,
      },
    }
  }

  /**
   * Detect potential security and processing issues
   */
  private detectPotentialIssues(prompt: string): ValidationItem {
    // Check for potential script injection
    for (const pattern of VALIDATION_CONSTANTS.UNSAFE_CONTENT_PATTERNS) {
      if (pattern.test(prompt)) {
        return {
          valid: false,
          severity: Severity.FATAL,
          message: 'Potentially unsafe content detected',
          suggestion: 'Remove any code-like structures from the prompt',
        }
      }
    }

    // Check for extremely repetitive content
    const words = prompt.toLowerCase().split(/\s+/)
    const uniqueWords = new Set(words)
    if (words.length > 10 && uniqueWords.size < words.length * 0.3) {
      return {
        valid: false,
        severity: Severity.DEGRADED,
        message: 'Highly repetitive content detected',
        suggestion: 'Provide more varied descriptions for better results',
      }
    }

    return { valid: true }
  }

  /**
   * Detect language of the input text
   */
  private async detectLanguage(prompt: string): Promise<LanguageDetection> {
    // Simple language detection based on character patterns
    // In a real implementation, this would use a proper language detection library

    // Japanese characters
    if (/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(prompt)) {
      return {
        language: 'ja',
        confidence: 0.9,
        isSupported: this.supportedLanguages.has('ja'),
      }
    }

    // Chinese characters
    if (/[\u4e00-\u9faf]/.test(prompt)) {
      return {
        language: 'zh',
        confidence: 0.8,
        isSupported: this.supportedLanguages.has('zh'),
      }
    }

    // Korean characters
    if (/[\uac00-\ud7af]/.test(prompt)) {
      return {
        language: 'ko',
        confidence: 0.9,
        isSupported: this.supportedLanguages.has('ko'),
      }
    }

    // Default to English
    return {
      language: 'en',
      confidence: 0.7,
      isSupported: true,
    }
  }

  /**
   * Analyze content for appropriateness and safety
   */
  private async analyzeContent(prompt: string): Promise<ContentAnalysis> {
    const detectedLanguages = [(await this.detectLanguage(prompt)).language]
    const hasSpecialCharacters = VALIDATION_CONSTANTS.SPECIAL_CHAR_PATTERN.test(prompt)
    const encodingIssues = prompt.includes('\uFFFD')

    // Simple content appropriateness check
    const inappropriate = ['explicit', 'violent', 'harmful', 'illegal', 'offensive'].some((word) =>
      prompt.toLowerCase().includes(word)
    )

    if (inappropriate) {
      return {
        appropriate: false,
        message: 'Content may not comply with usage guidelines',
        suggestedModifications: [
          'Remove inappropriate content',
          'Use descriptive but appropriate language',
        ],
        detectedLanguages,
        hasSpecialCharacters,
        encodingIssues,
      }
    }

    return {
      appropriate: true,
      message: 'Content appears appropriate for processing',
      detectedLanguages,
      hasSpecialCharacters,
      encodingIssues,
    }
  }

  /**
   * Compile validation results into comprehensive report
   */
  private compileValidationResult(
    validations: ValidationItem[],
    originalPrompt: string
  ): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    let normalizedInput = originalPrompt

    for (let i = 0; i < validations.length; i++) {
      const validation = validations[i]
      if (!validation || validation.valid) continue

      if (validation.severity === Severity.FATAL) {
        errors.push({
          field: 'prompt',
          message: validation.message || 'Validation failed',
          severity: validation.severity,
          suggestion: validation.suggestion || 'Please fix this issue',
          code: `E${i + 1}`,
        })
      } else if (validation.severity === Severity.DEGRADED) {
        warnings.push({
          field: 'prompt',
          message: validation.message || 'Validation warning',
          suggestion: validation.suggestion || 'Consider addressing this issue',
          code: `W${i + 1}`,
        })
        // Apply normalization for degraded issues
        normalizedInput = this.normalizeInput(normalizedInput, validation)
      } else {
        warnings.push({
          field: 'prompt',
          message: validation.message || 'Validation warning',
          suggestion: validation.suggestion || 'Consider addressing this issue',
          code: `W${i + 1}`,
        })

        // Apply normalization for recoverable issues
        if (validation.severity === Severity.RECOVERABLE) {
          normalizedInput = this.normalizeInput(normalizedInput, validation)
        }
      }
    }

    // Check if there are any degraded severity issues that should make validation invalid
    const hasDegradedIssues = warnings.some(
      (warning) =>
        warning.code.startsWith('W') && warning.message.includes('exceeds recommended length')
    )

    const isValid = errors.length === 0 && !hasDegradedIssues

    return {
      valid: isValid,
      errors,
      warnings,
      normalizedInput:
        normalizedInput !== originalPrompt ? normalizedInput : isValid ? originalPrompt : undefined,
    }
  }

  /**
   * Normalize input based on validation issues
   */
  private normalizeInput(input: string, _validation: ValidationItem): string {
    // Apply specific normalization based on validation type
    let normalized = input

    // Trim whitespace
    normalized = normalized.trim()

    // Remove potential security issues
    for (const pattern of VALIDATION_CONSTANTS.UNSAFE_CONTENT_PATTERNS) {
      normalized = normalized.replace(pattern, '')
    }

    // Truncate if too long
    if (normalized.length > VALIDATION_CONSTANTS.MAX_PROMPT_LENGTH) {
      normalized = normalized.substring(0, VALIDATION_CONSTANTS.MAX_PROMPT_LENGTH)
      // Ensure we don't cut off mid-word by finding the last complete word
      const lastSpaceIndex = normalized.lastIndexOf(' ')
      if (lastSpaceIndex > normalized.length * 0.8) {
        normalized = normalized.substring(0, lastSpaceIndex).trim()
      } else {
        normalized = normalized.trim()
      }
      // Ensure no trailing partial words
      if (normalized.match(/\w+$/)) {
        const words = normalized.split(' ')
        if (words.length > 1) {
          // Remove the last word if it might be partial
          words.pop()
          normalized = words.join(' ')
        }
      }
    }

    return normalized
  }

  /**
   * Validate input against custom schema
   */
  async validateAgainstSchema(input: unknown, schema: ValidationSchema): Promise<ValidationResult> {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    // Type validation
    if (schema.type === 'string' && typeof input !== 'string') {
      errors.push({
        field: 'root',
        message: `Expected type string, got ${typeof input}`,
        severity: Severity.FATAL,
        code: 'TYPE_MISMATCH',
      })
    }

    // String-specific validations
    if (schema.type === 'string' && typeof input === 'string') {
      if (schema.minLength && input.length < schema.minLength) {
        errors.push({
          field: 'root',
          message: `Minimum length ${schema.minLength} required, got ${input.length}`,
          severity: Severity.RECOVERABLE,
          code: 'MIN_LENGTH',
        })
      }

      if (schema.maxLength && input.length > schema.maxLength) {
        warnings.push({
          field: 'root',
          message: `Exceeds recommended length ${schema.maxLength}, got ${input.length}`,
          suggestion: 'Consider shortening the input',
          code: 'MAX_LENGTH',
        })
      }

      if (schema.pattern && !schema.pattern.test(input)) {
        errors.push({
          field: 'root',
          message: 'Input does not match required pattern',
          severity: Severity.RECOVERABLE,
          code: 'PATTERN_MISMATCH',
        })
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      normalizedInput: errors.length === 0 ? input : undefined,
    }
  }
}
