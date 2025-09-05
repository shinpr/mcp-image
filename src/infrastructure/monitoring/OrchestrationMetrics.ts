/**
 * Comprehensive orchestration metrics collection system
 * Provides performance monitoring, cost tracking, and alerting capabilities
 */

import {
  ProcessingStage,
  type FallbackTier,
  type AlertStatus,
  type OrchestrationMetrics as IOrchestrationMetrics,
  type PerformanceReport,
  type CostAnalysis,
  type TimeRange,
  ReportingPeriod,
  type CurrentMetrics,
  type MemoryMetrics,
  type APIUsageRecord,
  type OptimizationSuggestion,
  type CostAnomaly,
  type MemoryEfficiencyMetrics,
  type BottleneckAnalysis,
  type MemoryLeakDetection,
} from '../../types/performanceTypes'

/**
 * Performance metric record for internal storage
 */
interface PerformanceMetricRecord {
  timestamp: number
  stage: ProcessingStage
  duration: number
  success: boolean
  fallbackTier?: FallbackTier
}

/**
 * Memory usage record for internal storage
 */
interface MemoryUsageRecord {
  timestamp: number
  operation: string
  metrics: MemoryMetrics
}

/**
 * Error record for tracking failures
 */
interface ErrorRecord {
  timestamp: number
  stage: ProcessingStage
  error: string
  stack: string | undefined
}

/**
 * OrchestrationMetrics implementation
 * Comprehensive monitoring system for structured prompt generation performance
 */
export class OrchestrationMetrics implements IOrchestrationMetrics {
  private performanceRecords: PerformanceMetricRecord[] = []
  private memoryRecords: MemoryUsageRecord[] = []
  private apiUsageRecords: APIUsageRecord[] = []
  private errorRecords: ErrorRecord[] = []
  private fallbackEvents: Array<{ timestamp: number; tier: FallbackTier; reason: string }> = []
  private alertStatuses: Map<string, AlertStatus> = new Map()

  // Configuration
  private readonly maxRecords = 10000 // Maximum records to keep in memory
  private readonly cleanupInterval = 60000 // Cleanup interval in milliseconds
  private cleanupTimer: NodeJS.Timeout | undefined

  constructor() {
    this.startCleanupTimer()
  }

  /**
   * Record processing time for a specific stage
   */
  recordProcessingTime(stage: ProcessingStage, duration: number): void {
    const record: PerformanceMetricRecord = {
      timestamp: Date.now(),
      stage,
      duration,
      success: true,
    }

    this.performanceRecords.push(record)
    this.maintainRecordLimit()
  }

  /**
   * Record memory usage for an operation
   */
  recordMemoryUsage(operation: string, usage: MemoryMetrics): void {
    const record: MemoryUsageRecord = {
      timestamp: Date.now(),
      operation,
      metrics: usage,
    }

    this.memoryRecords.push(record)
    this.maintainRecordLimit()
  }

  /**
   * Record API call with cost and success information
   */
  recordAPICall(client: string, cost: number, success: boolean, tokens = 0): void {
    const record: APIUsageRecord = {
      timestamp: Date.now(),
      client,
      operation: 'api_call',
      tokens,
      cost,
      success,
      processingTime: 0, // Will be updated by performance tracking
    }

    this.apiUsageRecords.push(record)
    this.maintainRecordLimit()
  }

  /**
   * Record fallback event
   */
  recordFallbackEvent(tier: FallbackTier, reason: string): void {
    this.fallbackEvents.push({
      timestamp: Date.now(),
      tier,
      reason,
    })

    // Mark related performance records with fallback tier
    const recentRecords = this.performanceRecords.filter(
      (r) => Date.now() - r.timestamp < 10000 // Last 10 seconds
    )
    recentRecords.forEach((record) => {
      record.fallbackTier = tier
    })

    this.maintainRecordLimit()
  }

  /**
   * Record error occurrence
   */
  recordError(stage: ProcessingStage, error: Error): void {
    const record: ErrorRecord = {
      timestamp: Date.now(),
      stage,
      error: error.message,
      stack: error.stack,
    }

    this.errorRecords.push(record)

    // Mark corresponding performance records as failed
    const recentRecords = this.performanceRecords.filter(
      (r) => r.stage === stage && Date.now() - r.timestamp < 5000 // Last 5 seconds
    )
    recentRecords.forEach((record) => {
      record.success = false
    })

    this.maintainRecordLimit()
  }

  /**
   * Generate comprehensive performance report
   */
  async getPerformanceReport(timeRange: TimeRange): Promise<PerformanceReport> {
    const filteredRecords = this.performanceRecords.filter(
      (record) => record.timestamp >= timeRange.start && record.timestamp <= timeRange.end
    )

    const successfulRecords = filteredRecords.filter((r) => r.success)
    const durations = successfulRecords.map((r) => r.duration)

    const averageProcessingTime =
      durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0

    // Calculate 95th percentile
    const sortedDurations = [...durations].sort((a, b) => a - b)
    const p95Index = Math.floor(sortedDurations.length * 0.95)
    const p95ProcessingTime = sortedDurations[p95Index] || 0

    const successRate =
      filteredRecords.length > 0 ? successfulRecords.length / filteredRecords.length : 1

    const fallbackRecords = filteredRecords.filter((r) => r.fallbackTier !== undefined)
    const fallbackRate =
      filteredRecords.length > 0 ? fallbackRecords.length / filteredRecords.length : 0

    const memoryEfficiency = await this.calculateMemoryEfficiency(timeRange)
    const bottleneckAnalysis = this.analyzeBottlenecks(filteredRecords)

    return {
      averageProcessingTime,
      p95ProcessingTime,
      successRate,
      fallbackRate,
      memoryEfficiency,
      bottleneckAnalysis,
      totalRequests: filteredRecords.length,
      timeRange,
    }
  }

  /**
   * Generate cost analysis report
   */
  async getCostAnalysis(period: ReportingPeriod): Promise<CostAnalysis> {
    const timeRange = this.getTimeRangeForPeriod(period)
    const filteredUsage = this.apiUsageRecords.filter(
      (record) => record.timestamp >= timeRange.start && record.timestamp <= timeRange.end
    )

    const totalCost = filteredUsage.reduce((sum, record) => sum + record.cost, 0)

    const costByClient = filteredUsage.reduce(
      (acc, record) => {
        acc[record.client] = (acc[record.client] || 0) + record.cost
        return acc
      },
      {} as Record<string, number>
    )

    const projectedMonthlyCost = this.projectMonthlyCost(filteredUsage, period)
    const costOptimizationSuggestions = this.generateOptimizationSuggestions(filteredUsage)
    const anomalyDetection = this.detectCostAnomalies(filteredUsage)

    return {
      totalCost,
      costByClient,
      projectedMonthlyCost,
      costOptimizationSuggestions,
      anomalyDetection,
    }
  }

  /**
   * Get current alert status for all configured alerts
   */
  async getAlertStatus(): Promise<AlertStatus[]> {
    return Array.from(this.alertStatuses.values())
  }

  /**
   * Get current metrics snapshot
   */
  getCurrentMetrics(): CurrentMetrics {
    const now = Date.now()
    const recentWindow = 300000 // 5 minutes

    const recentPerformance = this.performanceRecords.filter(
      (r) => now - r.timestamp < recentWindow
    )

    const processingTime: Record<ProcessingStage, number[]> = {} as Record<
      ProcessingStage,
      number[]
    >
    Object.values(ProcessingStage).forEach((stage) => {
      processingTime[stage] = recentPerformance
        .filter((r) => r.stage === stage && r.success)
        .map((r) => r.duration)
    })

    const recentMemory = this.memoryRecords[this.memoryRecords.length - 1]?.metrics || {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      arrayBuffers: 0,
      timestamp: now,
    }

    const recentErrors = this.errorRecords.filter((e) => now - e.timestamp < recentWindow)
    const recentSuccess = recentPerformance.filter((r) => r.success)

    const recentCost = this.apiUsageRecords
      .filter((r) => now - r.timestamp < recentWindow)
      .reduce((sum, r) => sum + r.cost, 0)

    return {
      processingTime,
      memoryUsage: recentMemory,
      errorCount: recentErrors.length,
      successCount: recentSuccess.length,
      totalCost: recentCost,
      activeRequests: 0, // Would be tracked by request manager
    }
  }

  /**
   * Calculate memory efficiency metrics
   */
  private async calculateMemoryEfficiency(timeRange: TimeRange): Promise<MemoryEfficiencyMetrics> {
    const filteredMemoryRecords = this.memoryRecords.filter(
      (record) => record.timestamp >= timeRange.start && record.timestamp <= timeRange.end
    )

    if (filteredMemoryRecords.length === 0) {
      return {
        peakMemoryUsage: 0,
        averageMemoryUsage: 0,
        memoryLeaks: [],
        garbageCollectionImpact: 0,
      }
    }

    const heapUsages = filteredMemoryRecords.map((r) => r.metrics.heapUsed)
    const peakMemoryUsage = Math.max(...heapUsages)
    const averageMemoryUsage = heapUsages.reduce((sum, usage) => sum + usage, 0) / heapUsages.length

    const memoryLeaks = this.detectMemoryLeaks(filteredMemoryRecords)
    const garbageCollectionImpact = this.calculateGCImpact(filteredMemoryRecords)

    return {
      peakMemoryUsage,
      averageMemoryUsage,
      memoryLeaks,
      garbageCollectionImpact,
    }
  }

  /**
   * Analyze performance bottlenecks
   */
  private analyzeBottlenecks(records: PerformanceMetricRecord[]): BottleneckAnalysis[] {
    const stageGroups = records.reduce(
      (acc, record) => {
        if (!acc[record.stage]) acc[record.stage] = []
        acc[record.stage].push(record)
        return acc
      },
      {} as Record<ProcessingStage, PerformanceMetricRecord[]>
    )

    const totalTime = records.reduce((sum, r) => sum + r.duration, 0)

    return Object.entries(stageGroups)
      .map(([stage, stageRecords]) => {
        const stageDurations = stageRecords.map((r) => r.duration)
        const avgDuration = stageDurations.reduce((sum, d) => sum + d, 0) / stageDurations.length
        const stageTotal = stageDurations.reduce((sum, d) => sum + d, 0)
        const impactPercentage = totalTime > 0 ? (stageTotal / totalTime) * 100 : 0

        const recommendedOptimizations = this.generateOptimizationRecommendations(
          stage as ProcessingStage,
          avgDuration
        )

        return {
          stage: stage as ProcessingStage,
          avgDuration,
          impactPercentage,
          recommendedOptimizations,
        }
      })
      .sort((a, b) => b.impactPercentage - a.impactPercentage)
  }

  /**
   * Generate optimization recommendations for a stage
   */
  private generateOptimizationRecommendations(
    stage: ProcessingStage,
    avgDuration: number
  ): string[] {
    const recommendations: string[] = []

    if (avgDuration > 10000) {
      // More than 10 seconds
      switch (stage) {
        case ProcessingStage.PROMPT_GENERATION:
          recommendations.push('Consider prompt caching for similar requests')
          recommendations.push('Implement prompt template optimization')
          break
        case ProcessingStage.IMAGE_GENERATION:
          recommendations.push('Optimize image generation parameters')
          recommendations.push('Consider image size optimization')
          break
        case ProcessingStage.POML_PROCESSING:
          recommendations.push('Cache POML processing results')
          recommendations.push('Optimize POML parsing algorithms')
          break
        default:
          recommendations.push('Consider parallel processing where possible')
          recommendations.push('Implement intelligent caching')
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance within acceptable limits')
    }

    return recommendations
  }

  /**
   * Detect memory leaks from memory usage patterns
   */
  private detectMemoryLeaks(records: MemoryUsageRecord[]): MemoryLeakDetection[] {
    const leaks: MemoryLeakDetection[] = []

    if (records.length < 10) return leaks

    // Simple trend analysis - if memory consistently increases
    const recentRecords = records.slice(-10)
    const firstUsage = recentRecords[0]?.metrics.heapUsed || 0
    const lastUsage = recentRecords[recentRecords.length - 1]?.metrics.heapUsed || 0
    const trend = lastUsage - firstUsage

    if (trend > 50 * 1024 * 1024) {
      // 50MB increase
      leaks.push({
        suspectedLocation: 'general_processing',
        leakRate: trend / recentRecords.length,
        severity: trend > 100 * 1024 * 1024 ? 'high' : 'medium',
      })
    }

    return leaks
  }

  /**
   * Calculate garbage collection impact
   */
  private calculateGCImpact(records: MemoryUsageRecord[]): number {
    if (records.length < 2) return 0

    // Look for sudden memory drops (GC events)
    let gcEvents = 0
    let totalDrop = 0

    for (let i = 1; i < records.length; i++) {
      const prevUsage = records[i - 1]?.metrics.heapUsed || 0
      const currentUsage = records[i]?.metrics.heapUsed || 0
      const drop = prevUsage - currentUsage

      if (drop > 10 * 1024 * 1024) {
        // 10MB drop suggests GC
        gcEvents++
        totalDrop += drop
      }
    }

    return gcEvents > 0 ? totalDrop / records.length : 0
  }

  /**
   * Generate cost optimization suggestions
   */
  private generateOptimizationSuggestions(usage: APIUsageRecord[]): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = []

    const failedCalls = usage.filter((r) => !r.success)
    if (failedCalls.length > usage.length * 0.05) {
      // More than 5% failure rate
      suggestions.push({
        type: 'reduce_fallback',
        description: 'High failure rate detected - improve error handling and retry logic',
        potentialSavings: failedCalls.reduce((sum, r) => sum + r.cost, 0),
        implementationEffort: 'medium',
      })
    }

    // Check for duplicate expensive calls (potential caching opportunity)
    const expensiveCalls = usage.filter((r) => r.cost > 0.01) // Calls costing more than 1 cent
    if (expensiveCalls.length > 10) {
      suggestions.push({
        type: 'improve_caching',
        description: 'Multiple expensive API calls detected - implement intelligent caching',
        potentialSavings: expensiveCalls.reduce((sum, r) => sum + r.cost, 0) * 0.3, // Assume 30% savings
        implementationEffort: 'low',
      })
    }

    return suggestions
  }

  /**
   * Detect cost anomalies
   */
  private detectCostAnomalies(usage: APIUsageRecord[]): CostAnomaly[] {
    const anomalies: CostAnomaly[] = []

    if (usage.length === 0) return anomalies

    const avgCost = usage.reduce((sum, r) => sum + r.cost, 0) / usage.length
    const totalCost = usage.reduce((sum, r) => sum + r.cost, 0)

    // Check for cost spikes
    const expensiveCalls = usage.filter((r) => r.cost > avgCost * 10)
    if (expensiveCalls.length > 0) {
      anomalies.push({
        timestamp: Date.now(),
        type: 'spike',
        description: `Detected ${expensiveCalls.length} API calls with unusually high cost`,
        severity: expensiveCalls.length > 5 ? 'high' : 'medium',
        estimatedImpact: expensiveCalls.reduce((sum, r) => sum + r.cost, 0),
      })
    }

    // Check for budget concerns (example threshold)
    const dailyBudget = 10.0 // $10 daily budget example
    if (totalCost > dailyBudget * 0.8) {
      anomalies.push({
        timestamp: Date.now(),
        type: 'budget_exceeded',
        description: `Cost approaching daily budget limit: $${totalCost.toFixed(2)} of $${dailyBudget}`,
        severity: totalCost > dailyBudget ? 'critical' : 'medium',
        estimatedImpact: totalCost - dailyBudget,
      })
    }

    return anomalies
  }

  /**
   * Project monthly cost based on period data
   */
  private projectMonthlyCost(usage: APIUsageRecord[], period: ReportingPeriod): number {
    if (usage.length === 0) return 0

    const totalCost = usage.reduce((sum, r) => sum + r.cost, 0)

    const multipliers: Record<ReportingPeriod, number> = {
      [ReportingPeriod.LAST_HOUR]: 24 * 30, // Hour to month
      [ReportingPeriod.LAST_DAY]: 30, // Day to month
      [ReportingPeriod.LAST_WEEK]: 4.33, // Week to month
      [ReportingPeriod.LAST_MONTH]: 1, // Already monthly
    }

    return totalCost * (multipliers[period] || 1)
  }

  /**
   * Get time range for reporting period
   */
  private getTimeRangeForPeriod(period: ReportingPeriod): TimeRange {
    const now = Date.now()
    const periods: Record<ReportingPeriod, number> = {
      [ReportingPeriod.LAST_HOUR]: 60 * 60 * 1000,
      [ReportingPeriod.LAST_DAY]: 24 * 60 * 60 * 1000,
      [ReportingPeriod.LAST_WEEK]: 7 * 24 * 60 * 60 * 1000,
      [ReportingPeriod.LAST_MONTH]: 30 * 24 * 60 * 60 * 1000,
    }

    return {
      start: now - periods[period],
      end: now,
    }
  }

  /**
   * Maintain record limits to prevent memory issues
   */
  private maintainRecordLimit(): void {
    if (this.performanceRecords.length > this.maxRecords) {
      this.performanceRecords = this.performanceRecords.slice(-this.maxRecords / 2)
    }
    if (this.memoryRecords.length > this.maxRecords) {
      this.memoryRecords = this.memoryRecords.slice(-this.maxRecords / 2)
    }
    if (this.apiUsageRecords.length > this.maxRecords) {
      this.apiUsageRecords = this.apiUsageRecords.slice(-this.maxRecords / 2)
    }
    if (this.errorRecords.length > this.maxRecords) {
      this.errorRecords = this.errorRecords.slice(-this.maxRecords / 2)
    }
  }

  /**
   * Start cleanup timer for old records
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000 // 24 hours

      this.performanceRecords = this.performanceRecords.filter((r) => r.timestamp > cutoff)
      this.memoryRecords = this.memoryRecords.filter((r) => r.timestamp > cutoff)
      this.apiUsageRecords = this.apiUsageRecords.filter((r) => r.timestamp > cutoff)
      this.errorRecords = this.errorRecords.filter((r) => r.timestamp > cutoff)
      this.fallbackEvents = this.fallbackEvents.filter((r) => r.timestamp > cutoff)
    }, this.cleanupInterval)
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }

    this.performanceRecords = []
    this.memoryRecords = []
    this.apiUsageRecords = []
    this.errorRecords = []
    this.fallbackEvents = []
    this.alertStatuses.clear()
  }
}
