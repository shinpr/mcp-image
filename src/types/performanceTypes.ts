/**
 * Performance monitoring and optimization type definitions
 * Provides comprehensive monitoring capabilities for structured prompt generation
 */

/**
 * Processing stages for performance measurement
 */
export enum ProcessingStage {
  PROMPT_GENERATION = 'prompt_generation',
  IMAGE_GENERATION = 'image_generation',
  POML_PROCESSING = 'poml_processing',
  BEST_PRACTICES = 'best_practices',
  FALLBACK_PROCESSING = 'fallback_processing',
  TOTAL_PROCESSING = 'total_processing',
}

/**
 * Fallback tier classification for monitoring
 */
export enum FallbackTier {
  NO_FALLBACK = 'no_fallback',
  REDUCED_FEATURES = 'reduced_features',
  MINIMAL_PROCESSING = 'minimal_processing',
  DIRECT_PROMPT = 'direct_prompt',
}

/**
 * Alert types for monitoring system
 */
export enum AlertType {
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  COST_THRESHOLD = 'cost_threshold',
  ERROR_RATE = 'error_rate',
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
}

/**
 * Memory usage metrics
 */
export interface MemoryMetrics {
  heapUsed: number
  heapTotal: number
  external: number
  arrayBuffers: number
  timestamp: number
}

/**
 * Memory leak detection information
 */
export interface MemoryLeakDetection {
  suspectedLocation: string
  leakRate: number // bytes per operation
  severity: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * Memory efficiency metrics
 */
export interface MemoryEfficiencyMetrics {
  peakMemoryUsage: number
  averageMemoryUsage: number
  memoryLeaks: MemoryLeakDetection[]
  garbageCollectionImpact: number
}

/**
 * Bottleneck analysis information
 */
export interface BottleneckAnalysis {
  stage: ProcessingStage
  avgDuration: number
  impactPercentage: number
  recommendedOptimizations: string[]
}

/**
 * Time range for performance reports
 */
export interface TimeRange {
  start: number
  end: number
}

/**
 * Reporting period options
 */
export enum ReportingPeriod {
  LAST_HOUR = 'last_hour',
  LAST_DAY = 'last_day',
  LAST_WEEK = 'last_week',
  LAST_MONTH = 'last_month',
}

/**
 * Performance report structure
 */
export interface PerformanceReport {
  averageProcessingTime: number
  p95ProcessingTime: number
  successRate: number
  fallbackRate: number
  memoryEfficiency: MemoryEfficiencyMetrics
  bottleneckAnalysis: BottleneckAnalysis[]
  totalRequests: number
  timeRange: TimeRange
}

/**
 * API usage record for cost tracking
 */
export interface APIUsageRecord {
  timestamp: number
  client: string
  operation: string
  tokens: number
  cost: number
  success: boolean
  processingTime: number
}

/**
 * Cost optimization suggestion
 */
export interface OptimizationSuggestion {
  type: 'reduce_fallback' | 'improve_caching' | 'batch_requests' | 'optimize_prompts'
  description: string
  potentialSavings: number
  implementationEffort: 'low' | 'medium' | 'high'
}

/**
 * Cost analysis report
 */
export interface CostAnalysis {
  totalCost: number
  costByClient: Record<string, number>
  projectedMonthlyCost: number
  costOptimizationSuggestions: OptimizationSuggestion[]
  anomalyDetection: CostAnomaly[]
}

/**
 * Cost anomaly detection
 */
export interface CostAnomaly {
  timestamp: number
  type: 'spike' | 'unusual_pattern' | 'budget_exceeded'
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  estimatedImpact: number
}

/**
 * Alert rule configuration
 */
export interface AlertRule {
  id: string
  name: string
  type: AlertType
  enabled: boolean
  conditions: AlertCondition[]
  actions: AlertAction[]
  threshold: number
  cooldownPeriod: number // milliseconds
}

/**
 * Alert condition definition
 */
export interface AlertCondition {
  metric: string
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
  value: number
  timeWindow: number // milliseconds
}

/**
 * Alert action configuration
 */
export interface AlertAction {
  type: 'log' | 'webhook' | 'email'
  config: Record<string, unknown>
}

/**
 * Alert event information
 */
export interface AlertEvent {
  id: string
  ruleId: string
  timestamp: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  context: Record<string, unknown>
  resolved: boolean
  resolvedAt?: number
}

/**
 * Alert evaluation result
 */
export interface AlertEvaluation {
  triggered: boolean
  reason?: string
  metric?: string
  actualValue?: number
  threshold?: number
}

/**
 * Current metrics snapshot
 */
export interface CurrentMetrics {
  processingTime: Record<ProcessingStage, number[]>
  memoryUsage: MemoryMetrics
  errorCount: number
  successCount: number
  totalCost: number
  activeRequests: number
}

/**
 * Alert status information
 */
export interface AlertStatus {
  ruleId: string
  ruleName: string
  status: 'normal' | 'warning' | 'critical'
  lastTriggered?: number
  activeAlerts: number
}

/**
 * Performance metrics collection interface
 */
export interface OrchestrationMetrics {
  recordProcessingTime(stage: ProcessingStage, duration: number): void
  recordMemoryUsage(operation: string, usage: MemoryMetrics): void
  recordAPICall(client: string, cost: number, success: boolean, tokens: number): void
  recordFallbackEvent(tier: FallbackTier, reason: string): void
  recordError(stage: ProcessingStage, error: Error): void

  getPerformanceReport(timeRange: TimeRange): Promise<PerformanceReport>
  getCostAnalysis(period: ReportingPeriod): Promise<CostAnalysis>
  getAlertStatus(): Promise<AlertStatus[]>
  getCurrentMetrics(): CurrentMetrics
}

/**
 * Cache optimization configuration
 */
export interface CacheOptimization {
  strategy: 'intelligent_prefetch' | 'adaptive_lru' | 'maintain_current'
  config?: {
    prefetchThreshold?: number
    cacheSize?: number
    evictionPolicy?: string
  }
}

/**
 * Memory optimization configuration
 */
export interface MemoryOptimization {
  streamProcessing: boolean
  batchProcessing: boolean
  memoryPooling: boolean
  garbageCollectionTuning: boolean
}

/**
 * Performance analysis result
 */
export interface PerformanceAnalysis {
  averagePromptSize: number
  concurrentRequests: number
  memoryFragmentation: number
  gcImpact: number
  cacheMetrics: {
    hitRate: number
    missRate: number
  }
  memoryConstraints: {
    available: number
    limit: number
  }
}

/**
 * Optimization request parameters
 */
export interface OptimizationRequest {
  targetStage?: ProcessingStage
  currentLoad: number
  timeConstraints?: number
  memoryConstraints?: number
}

/**
 * Optimized pipeline configuration
 */
export interface OptimizedPipeline {
  cacheOptimization: CacheOptimization
  memoryOptimization: MemoryOptimization
  resourceAllocation: ResourceAllocation
  apiCallPattern: APICallPattern
}

/**
 * Resource allocation configuration
 */
export interface ResourceAllocation {
  maxConcurrentRequests: number
  memoryLimit: number
  priorityQueuing: boolean
  resourcePooling: boolean
}

/**
 * API call pattern optimization
 */
export interface APICallPattern {
  batchingEnabled: boolean
  rateLimitOptimization: boolean
  connectionPooling: boolean
  intelligentRetry: boolean
}
