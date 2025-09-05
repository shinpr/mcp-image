/**
 * Configurable alerting system for performance monitoring
 * Provides intelligent threshold management and alert notification capabilities
 */

import {
  type AlertCondition,
  type AlertEvaluation,
  type AlertEvent,
  type AlertRule,
  AlertType,
  type CurrentMetrics,
} from '../../types/performanceTypes'

/**
 * Alert notification handler interface
 */
interface AlertNotificationHandler {
  sendAlert(event: AlertEvent): Promise<void>
  isHealthy(): boolean
}

/**
 * Log-based alert handler
 */
class LogAlertHandler implements AlertNotificationHandler {
  async sendAlert(event: AlertEvent): Promise<void> {
    const logLevel = this.getLogLevel(event.severity)
    console[logLevel](`[ALERT ${event.severity.toUpperCase()}] ${event.message}`, {
      ruleId: event.ruleId,
      timestamp: new Date(event.timestamp).toISOString(),
      context: event.context,
    })
  }

  isHealthy(): boolean {
    return true // Log handler is always considered healthy
  }

  private getLogLevel(severity: string): 'info' | 'warn' | 'error' {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error'
      case 'medium':
        return 'warn'
      default:
        return 'info'
    }
  }
}

/**
 * Webhook-based alert handler
 */
class WebhookAlertHandler implements AlertNotificationHandler {
  private webhookUrl: string
  private isActive = true

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl
  }

  async sendAlert(event: AlertEvent): Promise<void> {
    if (!this.isActive) {
      throw new Error('Webhook handler is not healthy')
    }

    try {
      // In a real implementation, this would make an HTTP request
      console.log(`Sending webhook alert to ${this.webhookUrl}:`, {
        alert: event,
        payload: {
          text: `Alert: ${event.message}`,
          severity: event.severity,
          timestamp: event.timestamp,
          context: event.context,
        },
      })

      // Simulate webhook call success
      await new Promise((resolve) => setTimeout(resolve, 100))
    } catch (error) {
      this.isActive = false
      throw new Error(`Webhook alert failed: ${error}`)
    }
  }

  isHealthy(): boolean {
    return this.isActive
  }
}

/**
 * AlertingSystem class
 * Comprehensive alerting system with configurable rules and intelligent threshold management
 */
export class AlertingSystem {
  private alertRules: Map<string, AlertRule> = new Map()
  private alertHistory: AlertEvent[] = []
  private notificationHandlers: Map<string, AlertNotificationHandler> = new Map()
  private cooldownTracking: Map<string, number> = new Map()
  private readonly maxHistorySize = 1000

  constructor() {
    // Initialize default notification handlers
    this.notificationHandlers.set('log', new LogAlertHandler())

    // Initialize default alert rules
    this.initializeDefaultRules()
  }

  /**
   * Initialize default alert rules for common monitoring scenarios
   */
  private initializeDefaultRules(): void {
    // Performance degradation alert
    this.addAlertRule({
      id: 'performance_degradation',
      name: 'Performance Degradation Alert',
      type: AlertType.PERFORMANCE_DEGRADATION,
      enabled: true,
      conditions: [
        {
          metric: 'averageProcessingTime',
          operator: 'gt',
          value: 25000, // 25 seconds
          timeWindow: 300000, // 5 minutes
        },
      ],
      actions: [
        {
          type: 'log',
          config: { severity: 'high' },
        },
      ],
      threshold: 25000,
      cooldownPeriod: 600000, // 10 minutes
    })

    // High error rate alert
    this.addAlertRule({
      id: 'high_error_rate',
      name: 'High Error Rate Alert',
      type: AlertType.ERROR_RATE,
      enabled: true,
      conditions: [
        {
          metric: 'errorRate',
          operator: 'gt',
          value: 0.1, // 10% error rate
          timeWindow: 300000, // 5 minutes
        },
      ],
      actions: [
        {
          type: 'log',
          config: { severity: 'medium' },
        },
      ],
      threshold: 0.1,
      cooldownPeriod: 300000, // 5 minutes
    })

    // Memory usage alert
    this.addAlertRule({
      id: 'memory_exhaustion',
      name: 'Memory Exhaustion Alert',
      type: AlertType.RESOURCE_EXHAUSTION,
      enabled: true,
      conditions: [
        {
          metric: 'memoryUsage',
          operator: 'gt',
          value: 0.9, // 90% memory usage
          timeWindow: 60000, // 1 minute
        },
      ],
      actions: [
        {
          type: 'log',
          config: { severity: 'critical' },
        },
      ],
      threshold: 0.9,
      cooldownPeriod: 300000, // 5 minutes
    })

    // Cost threshold alert
    this.addAlertRule({
      id: 'daily_cost_threshold',
      name: 'Daily Cost Threshold Alert',
      type: AlertType.COST_THRESHOLD,
      enabled: true,
      conditions: [
        {
          metric: 'dailyCost',
          operator: 'gt',
          value: 50.0, // $50 daily limit
          timeWindow: 86400000, // 24 hours
        },
      ],
      actions: [
        {
          type: 'log',
          config: { severity: 'medium' },
        },
      ],
      threshold: 50.0,
      cooldownPeriod: 3600000, // 1 hour
    })
  }

  /**
   * Add or update an alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule)
  }

  /**
   * Remove an alert rule
   */
  removeAlertRule(ruleId: string): boolean {
    return this.alertRules.delete(ruleId)
  }

  /**
   * Get alert rule by ID
   */
  getAlertRule(ruleId: string): AlertRule | undefined {
    return this.alertRules.get(ruleId)
  }

  /**
   * Get all alert rules
   */
  getAllAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values())
  }

  /**
   * Enable or disable an alert rule
   */
  setAlertRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.alertRules.get(ruleId)
    if (rule) {
      rule.enabled = enabled
      return true
    }
    return false
  }

  /**
   * Add notification handler
   */
  addNotificationHandler(name: string, handler: AlertNotificationHandler): void {
    this.notificationHandlers.set(name, handler)
  }

  /**
   * Add webhook notification handler
   */
  addWebhookHandler(name: string, webhookUrl: string): void {
    this.notificationHandlers.set(name, new WebhookAlertHandler(webhookUrl))
  }

  /**
   * Check alerts against current metrics
   */
  async checkAlerts(metrics: CurrentMetrics): Promise<AlertEvent[]> {
    const triggeredAlerts: AlertEvent[] = []

    for (const [ruleId, rule] of this.alertRules) {
      if (!rule.enabled) {
        continue
      }

      // Check cooldown period
      const lastTriggered = this.cooldownTracking.get(ruleId)
      if (lastTriggered && Date.now() - lastTriggered < rule.cooldownPeriod) {
        continue
      }

      const evaluation = await this.evaluateAlertRule(rule, metrics)

      if (evaluation.triggered) {
        const alert = this.createAlertEvent(rule, evaluation, metrics)
        triggeredAlerts.push(alert)
        await this.processAlert(alert)

        // Update cooldown tracking
        this.cooldownTracking.set(ruleId, Date.now())
      }
    }

    return triggeredAlerts
  }

  /**
   * Evaluate a specific alert rule against metrics
   */
  private async evaluateAlertRule(
    rule: AlertRule,
    metrics: CurrentMetrics
  ): Promise<AlertEvaluation> {
    switch (rule.type) {
      case AlertType.PERFORMANCE_DEGRADATION:
        return this.evaluatePerformanceAlert(rule, metrics)
      case AlertType.COST_THRESHOLD:
        return this.evaluateCostAlert(rule, metrics)
      case AlertType.ERROR_RATE:
        return this.evaluateErrorRateAlert(rule, metrics)
      case AlertType.RESOURCE_EXHAUSTION:
        return this.evaluateResourceAlert(rule, metrics)
      default:
        return { triggered: false }
    }
  }

  /**
   * Evaluate performance degradation alerts
   */
  private evaluatePerformanceAlert(rule: AlertRule, metrics: CurrentMetrics): AlertEvaluation {
    const allProcessingTimes = Object.values(metrics.processingTime).flat()

    if (allProcessingTimes.length === 0) {
      return { triggered: false }
    }

    const averageProcessingTime =
      allProcessingTimes.reduce((sum, time) => sum + time, 0) / allProcessingTimes.length

    for (const condition of rule.conditions) {
      if (condition.metric === 'averageProcessingTime') {
        const triggered = this.evaluateCondition(condition, averageProcessingTime)
        if (triggered) {
          return {
            triggered: true,
            reason: `Average processing time ${averageProcessingTime}ms exceeds threshold ${condition.value}ms`,
            metric: condition.metric,
            actualValue: averageProcessingTime,
            threshold: condition.value,
          }
        }
      }
    }

    return { triggered: false }
  }

  /**
   * Evaluate cost threshold alerts
   */
  private evaluateCostAlert(rule: AlertRule, metrics: CurrentMetrics): AlertEvaluation {
    for (const condition of rule.conditions) {
      if (condition.metric === 'dailyCost' || condition.metric === 'totalCost') {
        const triggered = this.evaluateCondition(condition, metrics.totalCost)
        if (triggered) {
          return {
            triggered: true,
            reason: `Total cost $${metrics.totalCost.toFixed(2)} exceeds threshold $${condition.value.toFixed(2)}`,
            metric: condition.metric,
            actualValue: metrics.totalCost,
            threshold: condition.value,
          }
        }
      }
    }

    return { triggered: false }
  }

  /**
   * Evaluate error rate alerts
   */
  private evaluateErrorRateAlert(rule: AlertRule, metrics: CurrentMetrics): AlertEvaluation {
    const totalRequests = metrics.errorCount + metrics.successCount
    const errorRate = totalRequests > 0 ? metrics.errorCount / totalRequests : 0

    for (const condition of rule.conditions) {
      if (condition.metric === 'errorRate') {
        const triggered = this.evaluateCondition(condition, errorRate)
        if (triggered) {
          return {
            triggered: true,
            reason: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(condition.value * 100).toFixed(2)}%`,
            metric: condition.metric,
            actualValue: errorRate,
            threshold: condition.value,
          }
        }
      }
    }

    return { triggered: false }
  }

  /**
   * Evaluate resource exhaustion alerts
   */
  private evaluateResourceAlert(rule: AlertRule, metrics: CurrentMetrics): AlertEvaluation {
    for (const condition of rule.conditions) {
      if (condition.metric === 'memoryUsage') {
        const memoryUsageRatio =
          metrics.memoryUsage.heapTotal > 0
            ? metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal
            : 0

        const triggered = this.evaluateCondition(condition, memoryUsageRatio)
        if (triggered) {
          return {
            triggered: true,
            reason: `Memory usage ${(memoryUsageRatio * 100).toFixed(2)}% exceeds threshold ${(condition.value * 100).toFixed(2)}%`,
            metric: condition.metric,
            actualValue: memoryUsageRatio,
            threshold: condition.value,
          }
        }
      }
    }

    return { triggered: false }
  }

  /**
   * Evaluate a specific condition
   */
  private evaluateCondition(condition: AlertCondition, actualValue: number): boolean {
    switch (condition.operator) {
      case 'gt':
        return actualValue > condition.value
      case 'gte':
        return actualValue >= condition.value
      case 'lt':
        return actualValue < condition.value
      case 'lte':
        return actualValue <= condition.value
      case 'eq':
        return actualValue === condition.value
      default:
        return false
    }
  }

  /**
   * Create alert event from rule and evaluation
   */
  private createAlertEvent(
    rule: AlertRule,
    evaluation: AlertEvaluation,
    metrics: CurrentMetrics
  ): AlertEvent {
    const severity = this.calculateSeverity(rule, evaluation)

    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      timestamp: Date.now(),
      severity,
      message: evaluation.reason || `Alert triggered for rule: ${rule.name}`,
      context: {
        ruleName: rule.name,
        ruleType: rule.type,
        metric: evaluation.metric,
        actualValue: evaluation.actualValue,
        threshold: evaluation.threshold,
        currentMetrics: {
          activeRequests: metrics.activeRequests,
          errorCount: metrics.errorCount,
          successCount: metrics.successCount,
          totalCost: metrics.totalCost,
        },
      },
      resolved: false,
    }
  }

  /**
   * Calculate alert severity based on how much the threshold is exceeded
   */
  private calculateSeverity(
    rule: AlertRule,
    evaluation: AlertEvaluation
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (!evaluation.actualValue || !evaluation.threshold) {
      return 'medium'
    }

    const ratio = evaluation.actualValue / evaluation.threshold

    // Special handling for resource exhaustion (memory usage)
    if (rule.type === AlertType.RESOURCE_EXHAUSTION && ratio > 1.05) {
      return 'critical' // Memory exhaustion is always critical if exceeded
    }

    // Standard severity calculation
    if (ratio > 1.8) {
      return 'critical'
    }
    if (ratio > 1.4) {
      return 'high'
    }
    if (ratio > 1.1) {
      return 'medium'
    }
    return 'low'
  }

  /**
   * Process triggered alert by sending notifications
   */
  private async processAlert(alert: AlertEvent): Promise<void> {
    // Add to history
    this.alertHistory.push(alert)
    this.maintainHistoryLimit()

    // Get the rule to determine which actions to take
    const rule = this.alertRules.get(alert.ruleId)
    if (!rule) {
      console.error(`Alert rule not found for alert: ${alert.ruleId}`)
      return
    }

    // Execute alert actions
    const notifications = rule.actions.map(async (action) => {
      try {
        const handler = this.notificationHandlers.get(action.type)
        if (handler?.isHealthy()) {
          await handler.sendAlert(alert)
        } else {
          console.error(`Alert handler '${action.type}' not available or unhealthy`)
        }
      } catch (error) {
        console.error(`Failed to send alert via ${action.type}:`, error)
      }
    })

    await Promise.allSettled(notifications)
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit?: number): AlertEvent[] {
    const history = [...this.alertHistory].sort((a, b) => b.timestamp - a.timestamp)
    return limit ? history.slice(0, limit) : history
  }

  /**
   * Get active alerts (unresolved)
   */
  getActiveAlerts(): AlertEvent[] {
    return this.alertHistory.filter((alert) => !alert.resolved)
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alertHistory.find((a) => a.id === alertId)
    if (alert && !alert.resolved) {
      alert.resolved = true
      alert.resolvedAt = Date.now()
      return true
    }
    return false
  }

  /**
   * Get alert statistics
   */
  getAlertStatistics(): {
    totalAlerts: number
    activeAlerts: number
    alertsByRule: Record<string, number>
    alertsBySeverity: Record<string, number>
  } {
    const alertsByRule: Record<string, number> = {}
    const alertsBySeverity: Record<string, number> = {}

    this.alertHistory.forEach((alert) => {
      alertsByRule[alert.ruleId] = (alertsByRule[alert.ruleId] || 0) + 1
      alertsBySeverity[alert.severity] = (alertsBySeverity[alert.severity] || 0) + 1
    })

    return {
      totalAlerts: this.alertHistory.length,
      activeAlerts: this.getActiveAlerts().length,
      alertsByRule,
      alertsBySeverity,
    }
  }

  /**
   * Update alert rule threshold dynamically
   */
  updateAlertThreshold(ruleId: string, newThreshold: number): boolean {
    const rule = this.alertRules.get(ruleId)
    if (rule) {
      rule.threshold = newThreshold
      // Update conditions that use this threshold
      rule.conditions.forEach((condition) => {
        condition.value = newThreshold
      })
      return true
    }
    return false
  }

  /**
   * Maintain alert history size limit
   */
  private maintainHistoryLimit(): void {
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(-this.maxHistorySize / 2)
    }
  }

  /**
   * Get health status of all notification handlers
   */
  getNotificationHandlerStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {}

    for (const [name, handler] of this.notificationHandlers) {
      status[name] = handler.isHealthy()
    }

    return status
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.alertRules.clear()
    this.alertHistory = []
    this.notificationHandlers.clear()
    this.cooldownTracking.clear()
  }
}
