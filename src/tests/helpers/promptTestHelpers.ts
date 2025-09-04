/**
 * Test helper functions for prompt comparison and validation
 * Supports structured prompt analysis and best practices verification
 */

/**
 * Result of prompt structure comparison
 */
export interface PromptComparisonResult {
  structureScore: number // 0-100
  improvementDetected: boolean
  missingElements: string[]
  enhancedElements: string[]
  analysis: {
    originalWordCount: number
    structuredWordCount: number
    specificityIncrease: number
    technicalTermsAdded: number
  }
}

/**
 * Best practice validation result
 */
export interface ValidationResult {
  practiceApplied: boolean
  confidence: number // 0-100
  evidence: string[]
  suggestions: string[]
}

/**
 * Available best practices for validation
 */
export interface BestPractice {
  name:
    | 'hyper-specific'
    | 'character-consistency'
    | 'context-intent'
    | 'iterate-refine'
    | 'semantic-negatives'
    | 'aspect-ratio'
    | 'camera-control'
  keywords: string[]
  patterns: RegExp[]
  requirements: string[]
}

/**
 * POML (Prompt Orchestration Markup Language) elements
 */
export interface POMLElements {
  role?: string
  task?: string
  examples?: string[]
  constraints?: string[]
  outputFormat?: string
  structure: {
    hasRole: boolean
    hasTask: boolean
    hasExamples: boolean
    hasConstraints: boolean
    hasOutputFormat: boolean
  }
}

/**
 * Compare prompt structure between original and structured versions
 */
export function comparePromptStructure(
  original: string,
  structured: string
): PromptComparisonResult {
  const originalWords = original.split(/\s+/)
  const structuredWords = structured.split(/\s+/)

  // Calculate basic metrics
  const originalWordCount = originalWords.length
  const structuredWordCount = structuredWords.length
  const wordCountIncrease = structuredWordCount - originalWordCount

  // Detect technical terms (photography, art, etc.)
  const technicalTerms = [
    'wide-angle',
    'macro',
    '85mm',
    'portrait lens',
    'Dutch angle',
    'low-angle',
    'composition',
    'lighting',
    'depth of field',
    'ornate',
    'etched',
    'detailed',
    'specific',
    'high-end',
    'minimalist',
  ]

  const originalTechnicalCount = countTechnicalTerms(original, technicalTerms)
  const structuredTechnicalCount = countTechnicalTerms(structured, technicalTerms)
  const technicalTermsAdded = structuredTechnicalCount - originalTechnicalCount

  // Identify enhanced elements
  const enhancedElements = detectEnhancedElements(original, structured)
  const missingElements = detectMissingElements(original, structured)

  // Calculate improvement metrics
  const specificityIncrease = Math.min(100, (wordCountIncrease / originalWordCount) * 100)
  const structureScore = calculateStructureScore(
    wordCountIncrease,
    technicalTermsAdded,
    enhancedElements.length
  )

  const improvementDetected = structureScore > 30 || technicalTermsAdded > 0

  return {
    structureScore,
    improvementDetected,
    missingElements,
    enhancedElements,
    analysis: {
      originalWordCount,
      structuredWordCount,
      specificityIncrease,
      technicalTermsAdded,
    },
  }
}

/**
 * Validate that specific best practices are applied to a prompt
 */
export function validateBestPracticeApplication(
  prompt: string,
  practices: BestPractice[]
): ValidationResult[] {
  return practices.map((practice) => validateSinglePractice(prompt, practice))
}

/**
 * Extract POML elements from a structured prompt
 */
export function extractPOMLElements(prompt: string): POMLElements {
  const elements: POMLElements = {
    structure: {
      hasRole: false,
      hasTask: false,
      hasExamples: false,
      hasConstraints: false,
      hasOutputFormat: false,
    },
  }

  // Extract role definition
  const roleMatch = prompt.match(/\[ROLE:\s*(.*?)\]/)
  if (roleMatch?.[1]) {
    elements.role = roleMatch[1].trim()
    elements.structure.hasRole = true
  }

  // Extract task definition
  const taskMatch = prompt.match(/\[TASK:\s*(.*?)\]/)
  if (taskMatch?.[1]) {
    elements.task = taskMatch[1].trim()
    elements.structure.hasTask = true
  }

  // Extract examples
  const examplesMatch = prompt.match(/\[EXAMPLES:\s*(.*?)\]/s)
  if (examplesMatch?.[1]) {
    elements.examples = examplesMatch[1]
      .split('\n')
      .map((ex) => ex.trim())
      .filter(Boolean)
    elements.structure.hasExamples = true
  }

  // Extract constraints
  const constraintsMatch = prompt.match(/\[CONSTRAINTS:\s*(.*?)\]/s)
  if (constraintsMatch?.[1]) {
    elements.constraints = constraintsMatch[1]
      .split('\n')
      .map((c) => c.trim())
      .filter(Boolean)
    elements.structure.hasConstraints = true
  }

  // Extract output format
  const outputMatch = prompt.match(/\[OUTPUT:\s*(.*?)\]/)
  if (outputMatch?.[1]) {
    elements.outputFormat = outputMatch[1].trim()
    elements.structure.hasOutputFormat = true
  }

  return elements
}

/**
 * Create test data for various prompt scenarios
 */
export function createTestPromptScenarios() {
  return {
    basic: {
      original: 'create a logo',
      expectedEnhancements: ['purpose', 'design elements', 'camera instructions'],
    },
    character: {
      original: 'a warrior character',
      expectedEnhancements: ['detailed features', 'consistency maintenance'],
    },
    negative: {
      original: 'no cars on road',
      expectedTransformation: 'quiet empty street',
    },
    logo: {
      original: 'Create a logo',
      expectedContext: 'high-end, minimalist skincare brand',
    },
    photography: {
      original: 'portrait photo',
      expectedCameraTerms: ['85mm', 'portrait lens', 'wide-angle', 'macro'],
    },
  }
}

/**
 * Assert that a prompt contains expected enhancements
 */
export function assertPromptContainsEnhancements(
  prompt: string,
  expectedEnhancements: string[]
): void {
  const lowerPrompt = prompt.toLowerCase()
  const missing = expectedEnhancements.filter(
    (enhancement) => !lowerPrompt.includes(enhancement.toLowerCase())
  )

  if (missing.length > 0) {
    throw new Error(`Prompt missing expected enhancements: ${missing.join(', ')}`)
  }
}

/**
 * Assert that negative expressions are converted to positive
 */
export function assertNegativeToPositiveConversion(original: string, converted: string): void {
  const negativePatterns = [/\bno\s+\w+/, /\bnot\s+\w+/, /\bwithout\s+\w+/]
  const hasNegative = negativePatterns.some((pattern) => pattern.test(original))
  const stillHasNegative = negativePatterns.some((pattern) => pattern.test(converted))

  if (hasNegative && stillHasNegative) {
    throw new Error('Negative expressions not properly converted to positive equivalents')
  }
}

/**
 * Measure processing time within acceptable ranges
 */
export function measureProcessingTime<T>(
  operation: () => Promise<T>,
  minMs: number,
  maxMs: number
): Promise<{ result: T; duration: number; withinRange: boolean }> {
  const startTime = Date.now()

  return operation().then((result) => {
    const duration = Date.now() - startTime
    const withinRange = duration >= minMs && duration <= maxMs

    return { result, duration, withinRange }
  })
}

// Private helper functions

function countTechnicalTerms(text: string, terms: string[]): number {
  const lowerText = text.toLowerCase()
  return terms.reduce((count, term) => {
    return count + (lowerText.includes(term.toLowerCase()) ? 1 : 0)
  }, 0)
}

function detectEnhancedElements(original: string, structured: string): string[] {
  const originalLower = original.toLowerCase()
  const structuredLower = structured.toLowerCase()

  const enhancements = []

  // Check for added descriptive elements
  if (structuredLower.includes('detailed') && !originalLower.includes('detailed')) {
    enhancements.push('detailed descriptions')
  }

  if (structuredLower.includes('camera') && !originalLower.includes('camera')) {
    enhancements.push('camera instructions')
  }

  if (structuredLower.includes('purpose') && !originalLower.includes('purpose')) {
    enhancements.push('purpose specification')
  }

  if (structuredLower.includes('consistency') && !originalLower.includes('consistency')) {
    enhancements.push('consistency features')
  }

  return enhancements
}

function detectMissingElements(_original: string, _structured: string): string[] {
  // For now, assume no critical elements are missing in proper implementation
  // This would be expanded based on specific requirements
  return []
}

function calculateStructureScore(
  wordIncrease: number,
  technicalTermsAdded: number,
  enhancedElementsCount: number
): number {
  const wordScore = Math.min(40, wordIncrease * 2) // Up to 40 points for word increase
  const techScore = Math.min(30, technicalTermsAdded * 10) // Up to 30 points for technical terms
  const enhancementScore = Math.min(30, enhancedElementsCount * 10) // Up to 30 points for enhancements

  return Math.round(wordScore + techScore + enhancementScore)
}

function validateSinglePractice(prompt: string, practice: BestPractice): ValidationResult {
  const lowerPrompt = prompt.toLowerCase()
  let evidence: string[] = []
  let confidence = 0

  // Check keywords
  const keywordMatches = practice.keywords.filter((keyword) =>
    lowerPrompt.includes(keyword.toLowerCase())
  )
  evidence = evidence.concat(keywordMatches.map((k) => `Found keyword: "${k}"`))
  confidence += keywordMatches.length * 20

  // Check patterns
  const patternMatches = practice.patterns.filter((pattern) => pattern.test(prompt))
  evidence = evidence.concat(patternMatches.map((p) => `Matched pattern: ${p.source}`))
  confidence += patternMatches.length * 25

  const practiceApplied = confidence > 30
  confidence = Math.min(100, confidence)

  const suggestions = practiceApplied ? [] : practice.requirements

  return {
    practiceApplied,
    confidence,
    evidence,
    suggestions,
  }
}

/**
 * Default best practices configuration for testing
 */
export const DEFAULT_BEST_PRACTICES: BestPractice[] = [
  {
    name: 'hyper-specific',
    keywords: ['detailed', 'specific', 'ornate', 'etched', 'precise'],
    patterns: [/\w+\s+\w+\s+\w+/], // Multi-word descriptive phrases
    requirements: ['Add specific descriptive details', 'Use precise terminology'],
  },
  {
    name: 'character-consistency',
    keywords: ['character', 'features', 'consistency', 'maintain'],
    patterns: [/character.*features/, /consistency.*maintain/],
    requirements: ['Include character feature descriptions', 'Add consistency instructions'],
  },
  {
    name: 'context-intent',
    keywords: ['purpose', 'intent', 'context', 'brand', 'high-end'],
    patterns: [/for\s+a\s+\w+/, /purpose.*\w+/],
    requirements: ['Specify image purpose', 'Add contextual information'],
  },
  {
    name: 'camera-control',
    keywords: ['wide-angle', 'macro', '85mm', 'portrait lens', 'dutch angle', 'perspective'],
    patterns: [/\d+mm/, /wide-angle|macro|portrait\s+lens/],
    requirements: ['Add camera terminology', 'Specify shot composition'],
  },
  {
    name: 'semantic-negatives',
    keywords: ['empty', 'quiet', 'deserted', 'clean'],
    patterns: [/(?!.*\bno\s)(?!.*\bnot\s)(?!.*\bwithout\s)/],
    requirements: ['Convert negative to positive descriptions', 'Use affirmative language'],
  },
]
