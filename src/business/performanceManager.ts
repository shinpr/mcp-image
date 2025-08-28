/**
 * Performance Manager - Tracks and analyzes performance metrics
 * Measures internal processing time excluding API calls
 */

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  validationTime: number
  apiCallTime: number
  processingTime: number // API time excluded
  fileOperationTime: number
  totalTime: number
  memoryUsage: {
    before: NodeJS.MemoryUsage
    after: NodeJS.MemoryUsage
    peak: number
  }
}

/**
 * Performance analysis result
 */
export interface PerformanceAnalysis {
  isOptimal: boolean
  bottlenecks: string[]
  recommendations: string[]
}

/**
 * Performance manager class for tracking and analyzing performance
 */
export class PerformanceManager {
  private static readonly INTERNAL_PROCESSING_LIMIT_MS = 2000

  /**
   * Start performance metrics tracking
   * @returns PerformanceTracker instance
   */
  startMetrics(): PerformanceTracker {
    return new PerformanceTracker()
  }

  /**
   * Check if performance metrics are within acceptable limits
   * @param metrics Performance metrics to check
   * @returns True if within limits
   */
  static isWithinLimits(metrics: PerformanceMetrics): boolean {
    // API time is excluded from internal processing time check
    const internalTime = metrics.validationTime + metrics.processingTime + metrics.fileOperationTime

    return internalTime <= PerformanceManager.INTERNAL_PROCESSING_LIMIT_MS
  }

  /**
   * Analyze bottlenecks in performance metrics
   * @param metrics Performance metrics to analyze
   * @returns Performance analysis with bottlenecks and recommendations
   */
  static analyzeBottlenecks(metrics: PerformanceMetrics): PerformanceAnalysis {
    const bottlenecks: string[] = []

    if (metrics.validationTime > 100) {
      bottlenecks.push('validation')
    }
    if (metrics.processingTime > 1500) {
      bottlenecks.push('processing')
    }
    if (metrics.fileOperationTime > 300) {
      bottlenecks.push('file-operations')
    }

    return {
      isOptimal: bottlenecks.length === 0,
      bottlenecks,
      recommendations: PerformanceManager.generateRecommendations(bottlenecks),
    }
  }

  /**
   * Generate recommendations based on identified bottlenecks
   * @param bottlenecks List of performance bottlenecks
   * @returns List of recommendations
   */
  private static generateRecommendations(bottlenecks: string[]): string[] {
    const recommendations: string[] = []

    if (bottlenecks.includes('validation')) {
      recommendations.push('Consider caching validation results for repeated inputs')
      recommendations.push('Implement parallel validation for multiple parameters')
      recommendations.push('Use more efficient validation algorithms')
    }

    if (bottlenecks.includes('processing')) {
      recommendations.push('Optimize image processing algorithms')
      recommendations.push('Consider using streaming processing for large images')
      recommendations.push('Implement progressive processing techniques')
    }

    if (bottlenecks.includes('file-operations')) {
      recommendations.push('Use asynchronous file operations')
      recommendations.push('Optimize buffer management and memory usage')
      recommendations.push('Consider using temporary file storage for large operations')
    }

    if (bottlenecks.length === 0) {
      recommendations.push('Performance is optimal - no improvements needed')
    }

    return recommendations
  }
}

/**
 * Performance tracker for measuring execution time and memory usage
 */
export class PerformanceTracker {
  private startTime = process.hrtime.bigint()
  private checkpoints: Map<string, bigint> = new Map()
  private memoryStart = process.memoryUsage()
  private memoryPeak = 0

  constructor() {
    this.updateMemoryPeak()
  }

  /**
   * Record a checkpoint at the current time
   * @param name Name of the checkpoint
   */
  checkpoint(name: string): void {
    this.checkpoints.set(name, process.hrtime.bigint())
    this.updateMemoryPeak()
  }

  /**
   * Finish tracking and return performance metrics
   * @returns Performance metrics
   */
  finish(): PerformanceMetrics {
    const endTime = process.hrtime.bigint()
    const memoryEnd = process.memoryUsage()

    return {
      validationTime: this.getDuration('validation', 'api-start') || 0,
      apiCallTime: this.getDuration('api-start', 'api-end') || 0,
      processingTime: this.getDuration('api-end', 'processing-end') || 0,
      fileOperationTime: this.getDuration('processing-end', 'file-end') || 0,
      totalTime: Number(endTime - this.startTime) / 1000000, // nanoseconds to ms
      memoryUsage: {
        before: this.memoryStart,
        after: memoryEnd,
        peak: this.memoryPeak,
      },
    }
  }

  /**
   * Calculate duration between two checkpoints
   * @param start Start checkpoint name
   * @param end End checkpoint name
   * @returns Duration in milliseconds, or null if checkpoints not found
   */
  private getDuration(start: string, end: string): number | null {
    const startTime = this.checkpoints.get(start)
    const endTime = this.checkpoints.get(end)

    if (!startTime || !endTime) return null

    return Number(endTime - startTime) / 1000000 // nanoseconds to ms
  }

  /**
   * Update memory peak usage
   */
  private updateMemoryPeak(): void {
    const current = process.memoryUsage().heapUsed
    this.memoryPeak = Math.max(this.memoryPeak, current)

    // Log memory warnings if usage is very high (over 512MB)
    const MB = 1024 * 1024
    if (current > 512 * MB) {
      console.warn(`[PerformanceTracker] High memory usage detected: ${Math.round(current / MB)}MB`)
    }
  }
}
