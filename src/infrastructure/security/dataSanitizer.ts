/**
 * Data Sanitizer - Comprehensive threat detection and prompt sanitization
 * Detects and mitigates security threats in user prompts and data
 * Addresses SECURITY2 test case requirements
 */

import {
  type SanitizedPrompt,
  SecurityAction,
  type SecurityModification,
  SecuritySeverity,
  // ThreatAssessmentSummary, // Not used yet
  ThreatType,
} from './OrchestrationSecurityMiddleware'

/**
 * Threat detection result
 */
export interface ThreatDetectionResult {
  threatType: ThreatType
  threatsFound: ThreatMatch[]
  confidence: number
  severity: SecuritySeverity
}

/**
 * Individual threat match
 */
export interface ThreatMatch {
  pattern: string
  severity: SecuritySeverity
  location: ThreatLocation
  matchedText: string
  context: string
}

/**
 * Location of threat in content
 */
export interface ThreatLocation {
  start: number
  end: number
  line?: number
  column?: number
}

/**
 * Threat detector interface
 */
export interface ThreatDetector {
  detect(content: string): Promise<ThreatDetectionResult>
  getPatterns(): SecurityPattern[]
  updatePatterns(patterns: SecurityPattern[]): void
}

/**
 * Security pattern for threat detection
 */
export interface SecurityPattern {
  id: string
  pattern: RegExp
  threatType: ThreatType
  severity: SecuritySeverity
  description: string
  action: SecurityAction
  confidence: number
}

/**
 * Sanitization rule for content cleaning
 */
export interface SanitizationRule {
  id: string
  threatType: ThreatType
  pattern: RegExp
  replacement: string | ((match: string) => string)
  preserveContext: boolean
  logModification: boolean
}

/**
 * Content policy validator
 */
export interface ContentPolicyValidator {
  validate(content: string): Promise<ContentPolicyResult>
  getViolations(content: string): Promise<PolicyViolation[]>
}

/**
 * Content policy validation result
 */
export interface ContentPolicyResult {
  allowed: boolean
  violations: PolicyViolation[]
  score: number
  recommendations: string[]
}

/**
 * Individual policy violation
 */
export interface PolicyViolation {
  type: string
  severity: SecuritySeverity
  description: string
  location: ThreatLocation
  suggestedFix: string
}

/**
 * Prompt injection detector
 */
class PromptInjectionDetector implements ThreatDetector {
  private patterns: SecurityPattern[] = [
    {
      id: 'ignore_instructions',
      pattern: /ignore\s+(?:previous\s+)?instructions/gi,
      threatType: ThreatType.PROMPT_INJECTION,
      severity: SecuritySeverity.HIGH,
      description: 'Attempt to ignore previous instructions',
      action: SecurityAction.BLOCK,
      confidence: 0.9,
    },
    {
      id: 'system_override',
      pattern: /system\s*:\s*you\s+are\s+now/gi,
      threatType: ThreatType.PROMPT_INJECTION,
      severity: SecuritySeverity.HIGH,
      description: 'System role override attempt',
      action: SecurityAction.BLOCK,
      confidence: 0.85,
    },
    {
      id: 'script_injection',
      pattern: /<script[^>]*>.*?<\/script>/gis,
      threatType: ThreatType.PROMPT_INJECTION,
      severity: SecuritySeverity.CRITICAL,
      description: 'Script injection attempt',
      action: SecurityAction.BLOCK,
      confidence: 0.95,
    },
    {
      id: 'eval_injection',
      pattern: /eval\s*\(/gi,
      threatType: ThreatType.PROMPT_INJECTION,
      severity: SecuritySeverity.HIGH,
      description: 'Code evaluation injection',
      action: SecurityAction.BLOCK,
      confidence: 0.8,
    },
  ]

  async detect(content: string): Promise<ThreatDetectionResult> {
    const threatsFound: ThreatMatch[] = []

    for (const pattern of this.patterns) {
      const matches = Array.from(content.matchAll(pattern.pattern))

      for (const match of matches) {
        if (match.index !== undefined) {
          threatsFound.push({
            pattern: pattern.id,
            severity: pattern.severity,
            location: {
              start: match.index,
              end: match.index + match[0].length,
            },
            matchedText: match[0],
            context: this.extractContext(content, match.index, 50),
          })
        }
      }
    }

    const maxSeverity = this.getMaxSeverity(threatsFound)
    const confidence =
      threatsFound.length > 0
        ? Math.min(
            0.95,
            threatsFound.reduce((sum, threat) => {
              const pattern = this.patterns.find((p) => p.id === threat.pattern)
              return sum + (pattern?.confidence || 0)
            }, 0) / threatsFound.length
          )
        : 0

    return {
      threatType: ThreatType.PROMPT_INJECTION,
      threatsFound,
      confidence,
      severity: maxSeverity,
    }
  }

  getPatterns(): SecurityPattern[] {
    return [...this.patterns]
  }

  updatePatterns(patterns: SecurityPattern[]): void {
    this.patterns = patterns.filter((p) => p.threatType === ThreatType.PROMPT_INJECTION)
  }

  private extractContext(content: string, index: number, contextSize: number): string {
    const start = Math.max(0, index - contextSize)
    const end = Math.min(content.length, index + contextSize)
    return content.slice(start, end)
  }

  private getMaxSeverity(threats: ThreatMatch[]): SecuritySeverity {
    if (threats.some((t) => t.severity === SecuritySeverity.CRITICAL))
      return SecuritySeverity.CRITICAL
    if (threats.some((t) => t.severity === SecuritySeverity.HIGH)) return SecuritySeverity.HIGH
    if (threats.some((t) => t.severity === SecuritySeverity.MEDIUM)) return SecuritySeverity.MEDIUM
    return SecuritySeverity.LOW
  }
}

/**
 * Sensitive data detector
 */
class SensitiveDataDetector implements ThreatDetector {
  private patterns: SecurityPattern[] = [
    {
      id: 'email_address',
      pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      threatType: ThreatType.SENSITIVE_DATA_EXPOSURE,
      severity: SecuritySeverity.MEDIUM,
      description: 'Email address detected',
      action: SecurityAction.SANITIZE,
      confidence: 0.95,
    },
    {
      id: 'phone_number',
      pattern: /(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
      threatType: ThreatType.SENSITIVE_DATA_EXPOSURE,
      severity: SecuritySeverity.MEDIUM,
      description: 'Phone number detected',
      action: SecurityAction.SANITIZE,
      confidence: 0.8,
    },
    {
      id: 'credit_card',
      pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
      threatType: ThreatType.SENSITIVE_DATA_EXPOSURE,
      severity: SecuritySeverity.CRITICAL,
      description: 'Credit card number detected',
      action: SecurityAction.BLOCK,
      confidence: 0.9,
    },
    {
      id: 'ssn',
      pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g,
      threatType: ThreatType.SENSITIVE_DATA_EXPOSURE,
      severity: SecuritySeverity.CRITICAL,
      description: 'Social Security Number detected',
      action: SecurityAction.BLOCK,
      confidence: 0.85,
    },
    {
      id: 'api_key',
      pattern: /[a-z]{2,10}[_-]?[a-z0-9]{20,40}/gi,
      threatType: ThreatType.SENSITIVE_DATA_EXPOSURE,
      severity: SecuritySeverity.HIGH,
      description: 'Potential API key detected',
      action: SecurityAction.SANITIZE,
      confidence: 0.7,
    },
  ]

  async detect(content: string): Promise<ThreatDetectionResult> {
    const threatsFound: ThreatMatch[] = []

    for (const pattern of this.patterns) {
      const matches = Array.from(content.matchAll(pattern.pattern))

      for (const match of matches) {
        if (match.index !== undefined) {
          threatsFound.push({
            pattern: pattern.id,
            severity: pattern.severity,
            location: {
              start: match.index,
              end: match.index + match[0].length,
            },
            matchedText: match[0],
            context: this.extractContext(content, match.index, 30),
          })
        }
      }
    }

    return {
      threatType: ThreatType.SENSITIVE_DATA_EXPOSURE,
      threatsFound,
      confidence: threatsFound.length > 0 ? 0.9 : 0,
      severity: this.getMaxSeverity(threatsFound),
    }
  }

  getPatterns(): SecurityPattern[] {
    return [...this.patterns]
  }

  updatePatterns(patterns: SecurityPattern[]): void {
    this.patterns = patterns.filter((p) => p.threatType === ThreatType.SENSITIVE_DATA_EXPOSURE)
  }

  private extractContext(content: string, index: number, contextSize: number): string {
    const start = Math.max(0, index - contextSize)
    const end = Math.min(content.length, index + contextSize)
    return content.slice(start, end)
  }

  private getMaxSeverity(threats: ThreatMatch[]): SecuritySeverity {
    if (threats.some((t) => t.severity === SecuritySeverity.CRITICAL))
      return SecuritySeverity.CRITICAL
    if (threats.some((t) => t.severity === SecuritySeverity.HIGH)) return SecuritySeverity.HIGH
    if (threats.some((t) => t.severity === SecuritySeverity.MEDIUM)) return SecuritySeverity.MEDIUM
    return SecuritySeverity.LOW
  }
}

/**
 * Data Sanitizer - Main implementation
 */
export class DataSanitizer {
  private threatDetectors: Map<ThreatType, ThreatDetector>
  private sanitizationRules: SanitizationRule[]
  private contentPolicyValidator: ContentPolicyValidator

  constructor() {
    this.threatDetectors = new Map([
      [ThreatType.PROMPT_INJECTION, new PromptInjectionDetector() as ThreatDetector],
      [ThreatType.SENSITIVE_DATA_EXPOSURE, new SensitiveDataDetector() as ThreatDetector],
    ])

    this.sanitizationRules = this.createSanitizationRules()
    this.contentPolicyValidator = this.createContentPolicyValidator()
  }

  /**
   * Sanitize prompt data with comprehensive threat detection
   */
  async sanitizePromptData(prompt: string): Promise<SanitizedPrompt> {
    const originalLength = prompt.length
    let sanitizedPrompt = prompt
    const modificationsApplied: SecurityModification[] = []
    let totalThreatScore = 0
    let maxSeverity = SecuritySeverity.LOW

    // Multi-stage sanitization process
    const detectionResults = await Promise.all([
      this.detectPromptInjection(prompt),
      this.detectSensitiveData(prompt),
      this.detectMaliciousPatterns(prompt),
      this.validateContentPolicy(prompt),
    ])

    // Process each detection result
    for (const result of detectionResults) {
      if (result.threatsFound.length > 0) {
        const sanitizationResult = await this.applySanitizationForThreatType(
          sanitizedPrompt,
          result.threatType,
          result.threatsFound
        )

        sanitizedPrompt = sanitizationResult.sanitizedContent
        modificationsApplied.push(...sanitizationResult.modifications)

        // Update severity and score
        if (this.compareSeverity(result.severity, maxSeverity) > 0) {
          maxSeverity = result.severity
        }
        totalThreatScore += result.confidence
      }
    }

    // After sanitization, reassess if content is clean
    const postSanitizationThreats = await this.quickThreatCheck(sanitizedPrompt)
    const finalThreatsFound = postSanitizationThreats ? 1 : 0

    const securityScore = Math.max(0, 100 - totalThreatScore * 20)
    const originalThreatsFound = detectionResults.reduce(
      (sum, result) => sum + result.threatsFound.length,
      0
    )

    return {
      sanitizedPrompt,
      modificationsApplied,
      securityScore,
      threatAssessment: {
        clean:
          finalThreatsFound === 0 && modificationsApplied.length > 0
            ? true
            : originalThreatsFound === 0,
        confidence:
          finalThreatsFound === 0
            ? 0.95
            : Math.min(0.9, totalThreatScore / detectionResults.length),
        threatsFound: originalThreatsFound, // Report original threats found, not post-sanitization
        highestSeverity: originalThreatsFound === 0 ? SecuritySeverity.LOW : maxSeverity,
      },
      originalLength,
      sanitizedLength: sanitizedPrompt.length,
    }
  }

  /**
   * Detect prompt injection attempts
   */
  private async detectPromptInjection(prompt: string): Promise<ThreatDetectionResult> {
    const detector = this.threatDetectors.get(ThreatType.PROMPT_INJECTION)
    if (!detector) {
      return {
        threatType: ThreatType.PROMPT_INJECTION,
        threatsFound: [],
        confidence: 0,
        severity: SecuritySeverity.LOW,
      }
    }
    return detector.detect(prompt)
  }

  /**
   * Detect sensitive data exposure
   */
  private async detectSensitiveData(prompt: string): Promise<ThreatDetectionResult> {
    const detector = this.threatDetectors.get(ThreatType.SENSITIVE_DATA_EXPOSURE)
    if (!detector) {
      return {
        threatType: ThreatType.SENSITIVE_DATA_EXPOSURE,
        threatsFound: [],
        confidence: 0,
        severity: SecuritySeverity.LOW,
      }
    }
    return detector.detect(prompt)
  }

  /**
   * Detect malicious patterns
   */
  private async detectMaliciousPatterns(prompt: string): Promise<ThreatDetectionResult> {
    // Additional malicious pattern detection
    const maliciousPatterns = [
      /\.\s*constructor\s*\[/gi,
      /__proto__/gi,
      /prototype\s*\[/gi,
      /document\s*\.\s*cookie/gi,
    ]

    const threatsFound: ThreatMatch[] = []

    for (const [index, pattern] of maliciousPatterns.entries()) {
      const matches = Array.from(prompt.matchAll(pattern))

      for (const match of matches) {
        if (match.index !== undefined) {
          threatsFound.push({
            pattern: `malicious_${index}`,
            severity: SecuritySeverity.HIGH,
            location: {
              start: match.index,
              end: match.index + match[0].length,
            },
            matchedText: match[0],
            context: prompt.slice(Math.max(0, match.index - 20), match.index + 20),
          })
        }
      }
    }

    return {
      threatType: ThreatType.API_ABUSE,
      threatsFound,
      confidence: threatsFound.length > 0 ? 0.8 : 0,
      severity: threatsFound.length > 0 ? SecuritySeverity.HIGH : SecuritySeverity.LOW,
    }
  }

  /**
   * Validate content policy
   */
  private async validateContentPolicy(prompt: string): Promise<ThreatDetectionResult> {
    const policyResult = await this.contentPolicyValidator.validate(prompt)

    const threatsFound: ThreatMatch[] = policyResult.violations.map((violation) => ({
      pattern: violation.type,
      severity: violation.severity,
      location: violation.location,
      matchedText: prompt.slice(violation.location.start, violation.location.end),
      context: prompt.slice(
        Math.max(0, violation.location.start - 20),
        Math.min(prompt.length, violation.location.end + 20)
      ),
    }))

    return {
      threatType: ThreatType.DATA_EXFILTRATION,
      threatsFound,
      confidence: policyResult.violations.length > 0 ? 0.7 : 0,
      severity: threatsFound.length > 0 ? SecuritySeverity.MEDIUM : SecuritySeverity.LOW,
    }
  }

  /**
   * Apply sanitization for specific threat type
   */
  private async applySanitizationForThreatType(
    content: string,
    threatType: ThreatType,
    threats: ThreatMatch[]
  ): Promise<{ sanitizedContent: string; modifications: SecurityModification[] }> {
    let sanitizedContent = content
    const modifications: SecurityModification[] = []

    const relevantRules = this.sanitizationRules.filter((rule) => rule.threatType === threatType)

    for (const threat of threats) {
      const rule = relevantRules.find((r) => r.pattern.test(threat.matchedText))

      if (rule) {
        const replacement =
          typeof rule.replacement === 'string'
            ? rule.replacement
            : rule.replacement(threat.matchedText)

        const originalText = threat.matchedText
        sanitizedContent = sanitizedContent.replace(
          new RegExp(escapeRegExp(originalText), 'g'),
          replacement
        )

        modifications.push({
          type: rule.id,
          location: threat.location.start,
          originalText,
          replacementText: replacement,
          reason: `${threatType} detected and sanitized`,
          severity: threat.severity,
        })
      }
    }

    return { sanitizedContent, modifications }
  }

  /**
   * Create sanitization rules
   */
  private createSanitizationRules(): SanitizationRule[] {
    return [
      {
        id: 'email_sanitization',
        threatType: ThreatType.SENSITIVE_DATA_EXPOSURE,
        pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        replacement: '[EMAIL_REDACTED]',
        preserveContext: true,
        logModification: true,
      },
      {
        id: 'phone_sanitization',
        threatType: ThreatType.SENSITIVE_DATA_EXPOSURE,
        pattern: /(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
        replacement: '[PHONE_REDACTED]',
        preserveContext: true,
        logModification: true,
      },
      {
        id: 'script_removal',
        threatType: ThreatType.PROMPT_INJECTION,
        pattern: /<script[^>]*>.*?<\/script>/gis,
        replacement: '',
        preserveContext: false,
        logModification: true,
      },
      {
        id: 'injection_neutralization',
        threatType: ThreatType.PROMPT_INJECTION,
        pattern: /ignore\s+(?:previous\s+)?instructions/gi,
        replacement: 'follow instructions',
        preserveContext: true,
        logModification: true,
      },
    ]
  }

  /**
   * Create content policy validator
   */
  private createContentPolicyValidator(): ContentPolicyValidator {
    return {
      validate: async (content: string): Promise<ContentPolicyResult> => {
        const violations = await this.getViolations(content)
        const score = Math.max(0, 100 - violations.length * 15)

        return {
          allowed:
            violations.length === 0 ||
            violations.every((v) => v.severity !== SecuritySeverity.CRITICAL),
          violations,
          score,
          recommendations: violations.map((v) => v.suggestedFix),
        }
      },
      getViolations: (content: string): Promise<PolicyViolation[]> => {
        return this.getViolations(content)
      },
    }
  }

  /**
   * Get policy violations
   */
  private async getViolations(content: string): Promise<PolicyViolation[]> {
    const violations: PolicyViolation[] = []

    // Check for inappropriate content patterns
    const inappropriatePatterns = [
      { pattern: /\b(hack|crack|exploit)\b/gi, type: 'security_concern' },
      { pattern: /\b(password|secret|token)\s*[:=]/gi, type: 'credential_exposure' },
    ]

    for (const { pattern, type } of inappropriatePatterns) {
      const matches = Array.from(content.matchAll(pattern))

      for (const match of matches) {
        if (match.index !== undefined) {
          violations.push({
            type,
            severity: SecuritySeverity.MEDIUM,
            description: `Potential ${type.replace('_', ' ')} detected`,
            location: {
              start: match.index,
              end: match.index + match[0].length,
            },
            suggestedFix: `Consider rephrasing "${match[0]}" to avoid security concerns`,
          })
        }
      }
    }

    return violations
  }

  /**
   * Compare security severities
   */
  private compareSeverity(a: SecuritySeverity, b: SecuritySeverity): number {
    const severityOrder = {
      [SecuritySeverity.LOW]: 1,
      [SecuritySeverity.MEDIUM]: 2,
      [SecuritySeverity.HIGH]: 3,
      [SecuritySeverity.CRITICAL]: 4,
    }
    return severityOrder[a] - severityOrder[b]
  }

  /**
   * Quick threat check after sanitization
   */
  private async quickThreatCheck(content: string): Promise<boolean> {
    // Quick check for major threats that should have been removed
    const criticalPatterns = [
      /<script[^>]*>.*?<\/script>/gis,
      /eval\s*\(/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
    ]

    return criticalPatterns.some((pattern) => pattern.test(content))
  }

  /**
   * Get sanitization statistics
   */
  getSanitizationStats(): {
    totalRules: number
    detectors: string[]
    supportedThreatTypes: ThreatType[]
  } {
    return {
      totalRules: this.sanitizationRules.length,
      detectors: Array.from(this.threatDetectors.keys()),
      supportedThreatTypes: Array.from(this.threatDetectors.keys()),
    }
  }

  /**
   * Update threat detection patterns
   */
  updateThreatPatterns(threatType: ThreatType, patterns: SecurityPattern[]): void {
    const detector = this.threatDetectors.get(threatType)
    if (detector) {
      detector.updatePatterns(patterns)
    }
  }
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
