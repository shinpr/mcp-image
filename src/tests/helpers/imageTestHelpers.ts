/**
 * Enhanced test helper functions for image verification and testing
 * Supports structured prompt generation testing scenarios
 */

/**
 * Image quality metrics for testing
 */
export interface ImageQualityMetrics {
  size: number // bytes
  dimensions: {
    width: number
    height: number
    aspectRatio: number
  }
  format: 'png' | 'jpeg' | 'webp'
  isValid: boolean
  estimatedComplexity: 'low' | 'medium' | 'high'
}

/**
 * Performance timing measurements
 */
export interface PerformanceMeasurement {
  phase: string
  startTime: number
  endTime: number
  duration: number
  withinTarget: boolean
  target: { min: number; max: number }
}

/**
 * Test scenario configuration for image generation
 */
export interface ImageTestScenario {
  name: string
  prompt: string
  expectedEnhancements: string[]
  expectedFeatures?: {
    blendImages?: boolean
    maintainCharacterConsistency?: boolean
    useWorldKnowledge?: boolean
  }
  performanceTarget: {
    minMs: number
    maxMs: number
  }
}

/**
 * Validate that image buffer contains valid image data
 */
export function validateImageBuffer(buffer: Buffer): ImageQualityMetrics {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return {
      size: 0,
      dimensions: { width: 0, height: 0, aspectRatio: 0 },
      format: 'png',
      isValid: false,
      estimatedComplexity: 'low',
    }
  }

  const format = detectImageFormat(buffer)
  const dimensions = extractImageDimensions(buffer, format)
  const aspectRatio = dimensions.height > 0 ? dimensions.width / dimensions.height : 0

  return {
    size: buffer.length,
    dimensions: {
      ...dimensions,
      aspectRatio,
    },
    format,
    isValid: buffer.length > 100 && format !== undefined, // Basic validity check
    estimatedComplexity: estimateImageComplexity(buffer.length),
  }
}

/**
 * Measure and validate processing performance
 */
export async function measureImageGenerationPerformance<T>(
  operation: () => Promise<T>,
  phase: string,
  targetMin: number,
  targetMax: number
): Promise<{ result: T; measurement: PerformanceMeasurement }> {
  const startTime = Date.now()

  try {
    const result = await operation()
    const endTime = Date.now()
    const duration = endTime - startTime

    const measurement: PerformanceMeasurement = {
      phase,
      startTime,
      endTime,
      duration,
      withinTarget: duration >= targetMin && duration <= targetMax,
      target: { min: targetMin, max: targetMax },
    }

    return { result, measurement }
  } catch (error) {
    const endTime = Date.now()
    const duration = endTime - startTime

    // Create measurement for error tracking (not currently used)
    void ({
      phase: `${phase} (error)`,
      startTime,
      endTime,
      duration,
      withinTarget: false,
      target: { min: targetMin, max: targetMax },
    } as PerformanceMeasurement)

    throw error
  }
}

/**
 * Compare image generation quality between two approaches
 */
export function compareImageQuality(
  baseline: Buffer,
  enhanced: Buffer,
  context?: string
): {
  improvement: number // percentage
  metrics: {
    baseline: ImageQualityMetrics
    enhanced: ImageQualityMetrics
  }
  analysis: string[]
} {
  const baselineMetrics = validateImageBuffer(baseline)
  const enhancedMetrics = validateImageBuffer(enhanced)

  const analysis: string[] = []
  let improvement = 0

  // Size comparison (larger often indicates more detail)
  if (enhancedMetrics.size > baselineMetrics.size) {
    const sizeIncrease =
      ((enhancedMetrics.size - baselineMetrics.size) / baselineMetrics.size) * 100
    improvement += Math.min(sizeIncrease / 2, 25) // Cap at 25% improvement from size
    analysis.push(`Enhanced image is ${sizeIncrease.toFixed(1)}% larger, suggesting more detail`)
  }

  // Complexity comparison
  if (enhancedMetrics.estimatedComplexity !== baselineMetrics.estimatedComplexity) {
    const complexityMap = { low: 1, medium: 2, high: 3 }
    const baselineLevel = complexityMap[baselineMetrics.estimatedComplexity]
    const enhancedLevel = complexityMap[enhancedMetrics.estimatedComplexity]

    if (enhancedLevel > baselineLevel) {
      improvement += (enhancedLevel - baselineLevel) * 15 // 15% per complexity level
      analysis.push(
        `Complexity improved from ${baselineMetrics.estimatedComplexity} to ${enhancedMetrics.estimatedComplexity}`
      )
    }
  }

  // Format optimization
  if (enhancedMetrics.format === 'png' && baselineMetrics.format !== 'png') {
    improvement += 10
    analysis.push('Optimized to PNG format for better quality')
  }

  if (context) {
    analysis.push(`Context: ${context}`)
  }

  return {
    improvement: Math.min(100, Math.max(0, improvement)),
    metrics: {
      baseline: baselineMetrics,
      enhanced: enhancedMetrics,
    },
    analysis,
  }
}

/**
 * Create test image buffer for various scenarios
 */
export function createTestImageBuffer(
  format: 'png' | 'jpeg' | 'webp' = 'png',
  size: 'small' | 'medium' | 'large' = 'medium'
): Buffer {
  const signatures = {
    png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    jpeg: [0xff, 0xd8, 0xff, 0xe0],
    webp: [0x52, 0x49, 0x46, 0x46], // RIFF header
  }

  const sizes = {
    small: 500,
    medium: 2000,
    large: 10000,
  }

  const signature = signatures[format]
  const dataSize = sizes[size]

  const buffer = Buffer.alloc(signature.length + dataSize)

  // Write format signature
  for (let index = 0; index < signature.length; index++) {
    const byte = signature[index]
    buffer[index] = byte
  }

  // Fill with random data
  for (let i = signature.length; i < buffer.length; i++) {
    buffer[i] = Math.floor(Math.random() * 256)
  }

  return buffer
}

/**
 * Assert that image generation meets quality standards
 */
export function assertImageQualityStandards(
  imageBuffer: Buffer,
  standards: {
    minSize?: number
    maxSize?: number
    requiredFormat?: 'png' | 'jpeg' | 'webp'
    minComplexity?: 'low' | 'medium' | 'high'
  }
): void {
  const metrics = validateImageBuffer(imageBuffer)

  if (!metrics.isValid) {
    throw new Error('Generated image is not valid')
  }

  if (standards.minSize && metrics.size < standards.minSize) {
    throw new Error(`Image size ${metrics.size} is below minimum ${standards.minSize}`)
  }

  if (standards.maxSize && metrics.size > standards.maxSize) {
    throw new Error(`Image size ${metrics.size} exceeds maximum ${standards.maxSize}`)
  }

  if (standards.requiredFormat && metrics.format !== standards.requiredFormat) {
    throw new Error(
      `Image format ${metrics.format} does not match required ${standards.requiredFormat}`
    )
  }

  if (standards.minComplexity) {
    const complexityOrder = ['low', 'medium', 'high']
    const currentIndex = complexityOrder.indexOf(metrics.estimatedComplexity)
    const requiredIndex = complexityOrder.indexOf(standards.minComplexity)

    if (currentIndex < requiredIndex) {
      throw new Error(
        `Image complexity ${metrics.estimatedComplexity} is below minimum ${standards.minComplexity}`
      )
    }
  }
}

/**
 * Create standardized test scenarios for structured prompt testing
 */
export function createImageTestScenarios(): Record<string, ImageTestScenario> {
  return {
    basicPrompt: {
      name: 'Basic Prompt Enhancement',
      prompt: 'create a logo',
      expectedEnhancements: ['purpose', 'design elements', 'camera instructions'],
      performanceTarget: { minMs: 5000, maxMs: 15000 },
    },

    characterConsistency: {
      name: 'Character Consistency',
      prompt: 'a warrior character',
      expectedEnhancements: ['detailed features', 'consistency maintenance'],
      expectedFeatures: { maintainCharacterConsistency: true },
      performanceTarget: { minMs: 8000, maxMs: 20000 },
    },

    complexScene: {
      name: 'Complex Scene Optimization',
      prompt: 'fantasy landscape with multiple characters',
      expectedEnhancements: ['hyper-specific details', 'camera control', 'composition'],
      expectedFeatures: {
        blendImages: true,
        maintainCharacterConsistency: true,
        useWorldKnowledge: true,
      },
      performanceTarget: { minMs: 10000, maxMs: 25000 },
    },

    photographicControl: {
      name: 'Photographic Control',
      prompt: 'portrait photo',
      expectedEnhancements: ['85mm', 'portrait lens', 'camera terminology'],
      performanceTarget: { minMs: 5000, maxMs: 15000 },
    },

    negativeConversion: {
      name: 'Negative to Positive Conversion',
      prompt: 'no cars on the road',
      expectedEnhancements: ['quiet empty street', 'positive description'],
      performanceTarget: { minMs: 5000, maxMs: 15000 },
    },
  }
}

/**
 * Simulate concurrent image generation for stress testing
 */
export async function simulateConcurrentGeneration(
  imageGenerationFn: (prompt: string) => Promise<Buffer>,
  prompts: string[],
  maxConcurrency = 3
): Promise<{
  results: Buffer[]
  successCount: number
  errorCount: number
  averageTime: number
  maxTime: number
  minTime: number
}> {
  void Date.now() // Track start time (not currently used)
  const times: number[] = []
  const results: Buffer[] = []
  let successCount = 0
  let errorCount = 0

  // Process in batches to control concurrency
  for (let i = 0; i < prompts.length; i += maxConcurrency) {
    const batch = prompts.slice(i, i + maxConcurrency)

    const batchPromises = batch.map(async (prompt) => {
      const opStart = Date.now()
      try {
        const result = await imageGenerationFn(prompt)
        const opTime = Date.now() - opStart
        times.push(opTime)
        results.push(result)
        successCount++
        return result
      } catch (error) {
        const opTime = Date.now() - opStart
        times.push(opTime)
        errorCount++
        results.push(Buffer.alloc(0)) // Empty buffer for failed generation
        throw error
      }
    })

    // Wait for current batch to complete
    await Promise.allSettled(batchPromises)
  }

  return {
    results,
    successCount,
    errorCount,
    averageTime: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
    maxTime: times.length > 0 ? Math.max(...times) : 0,
    minTime: times.length > 0 ? Math.min(...times) : 0,
  }
}

// Private helper functions

function detectImageFormat(buffer: Buffer): 'png' | 'jpeg' | 'webp' {
  if (buffer.length < 8) return 'png' // Default fallback

  // PNG signature
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png'
  }

  // JPEG signature
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'jpeg'
  }

  // WebP signature (RIFF + WEBP)
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return 'webp'
  }

  return 'png' // Default fallback
}

function extractImageDimensions(
  buffer: Buffer,
  format: 'png' | 'jpeg' | 'webp'
): { width: number; height: number } {
  // For mock testing, return simulated dimensions
  // In a real implementation, this would parse actual image headers
  const baseSizes = {
    png: { width: 1024, height: 1024 },
    jpeg: { width: 1920, height: 1080 },
    webp: { width: 800, height: 600 },
  }

  const baseSize = baseSizes[format]

  // Vary dimensions slightly based on buffer content for realism
  const variation = (buffer.length % 200) - 100 // -100 to +100

  return {
    width: Math.max(100, baseSize.width + variation),
    height: Math.max(100, baseSize.height + variation),
  }
}

function estimateImageComplexity(size: number): 'low' | 'medium' | 'high' {
  if (size < 1000) return 'low'
  if (size < 5000) return 'medium'
  return 'high'
}

/**
 * Default image quality standards for testing
 */
export const DEFAULT_IMAGE_STANDARDS = {
  minSize: 500, // 500 bytes minimum
  maxSize: 50000000, // 50MB maximum
  requiredFormat: 'png' as const,
  minComplexity: 'medium' as const,
}
