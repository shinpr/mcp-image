/**
 * Concurrency Manager - Resource competition and concurrent operation management
 * Prevents system overload and manages resource allocation across concurrent operations
 * Provides intelligent queuing and resource contention resolution
 */

import type { Result } from '../../types/result'
import { Err, Ok } from '../../types/result'
import type {
  ResourceLimits,
  ResourceRequirements,
} from '../errorHandling/orchestrationErrorHandler'
import { OperationPriority } from '../errorHandling/orchestrationErrorHandler'

/**
 * Resource availability check result
 */
interface ResourceAvailability {
  available: boolean
  currentUsage: ResourceUsage
  estimatedWaitTime?: number
  reason?: string
}

/**
 * Current resource usage tracking
 */
interface ResourceUsage {
  memory: number
  cpu: number
  networkBandwidth: number
  concurrentOperations: number
  concurrentConnections: number
}

/**
 * Queued operation information
 */
interface QueuedOperation {
  id: string
  operation: () => Promise<unknown>
  priority: OperationPriority
  requirements: ResourceRequirements
  queuedAt: Date
  estimatedDuration: number
}

/**
 * Resource contention error
 */
export class ResourceContentionError extends Error {
  constructor(
    message: string,
    public readonly metadata: Record<string, unknown> = {}
  ) {
    super(message)
    this.name = 'ResourceContentionError'
  }
}

/**
 * Operation tracking information
 */
interface OperationTracking {
  id: string
  startTime: Date
  requirements: ResourceRequirements
  estimatedEndTime: Date
  actualUsage: Partial<ResourceUsage>
}

/**
 * Default resource limits
 */
const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxMemory: 1024 * 1024 * 1024, // 1GB
  maxCpu: 80, // 80% CPU usage
  maxNetworkBandwidth: 100 * 1024 * 1024, // 100MB/s
  maxConcurrentOperations: 10,
  maxConcurrentConnections: 50,
}

/**
 * ConcurrencyManager implementation for resource and operation management
 */
export class ConcurrencyManager {
  private readonly activeOperations: Map<string, OperationTracking> = new Map()
  private readonly operationQueue: QueuedOperation[] = []
  private readonly resourceLimits: ResourceLimits
  private readonly currentUsage: ResourceUsage
  private nextOperationId = 1

  constructor(resourceLimits: ResourceLimits = DEFAULT_RESOURCE_LIMITS) {
    this.resourceLimits = { ...resourceLimits }
    this.currentUsage = {
      memory: 0,
      cpu: 0,
      networkBandwidth: 0,
      concurrentOperations: 0,
      concurrentConnections: 0,
    }
  }

  /**
   * Manage concurrent operation with resource allocation
   */
  async manageConcurrentOperation<T>(
    operation: () => Promise<T>,
    resourceRequirements: ResourceRequirements,
    priority: OperationPriority = OperationPriority.NORMAL
  ): Promise<Result<T, ResourceContentionError>> {
    // Check resource availability
    const resourceCheck = await this.checkResourceAvailability(resourceRequirements)
    if (!resourceCheck.available) {
      return this.handleResourceContention(operation, priority, resourceRequirements)
    }

    // Execute with resource management
    const operationId = this.generateOperationId()
    try {
      this.trackOperation(operationId, resourceRequirements)
      const result = await operation()
      return Ok(result)
    } catch (error) {
      return Err(
        new ResourceContentionError(`Operation failed: ${error}`, {
          operationId,
          requirements: resourceRequirements,
        })
      )
    } finally {
      this.releaseOperation(operationId)
    }
  }

  /**
   * Check if resources are available for the operation
   */
  private async checkResourceAvailability(
    requirements: ResourceRequirements
  ): Promise<ResourceAvailability> {
    const wouldExceedMemory =
      this.currentUsage.memory + requirements.memory > this.resourceLimits.maxMemory
    const wouldExceedCpu = this.currentUsage.cpu + requirements.cpu > this.resourceLimits.maxCpu
    const wouldExceedBandwidth =
      this.currentUsage.networkBandwidth + requirements.networkBandwidth >
      this.resourceLimits.maxNetworkBandwidth
    const wouldExceedOperations =
      this.currentUsage.concurrentOperations + 1 > this.resourceLimits.maxConcurrentOperations
    const wouldExceedConnections =
      this.currentUsage.concurrentConnections + requirements.concurrentConnections >
      this.resourceLimits.maxConcurrentConnections

    const available =
      !wouldExceedMemory &&
      !wouldExceedCpu &&
      !wouldExceedBandwidth &&
      !wouldExceedOperations &&
      !wouldExceedConnections

    let reason: string | undefined
    if (!available) {
      const issues = []
      if (wouldExceedMemory) issues.push('memory')
      if (wouldExceedCpu) issues.push('cpu')
      if (wouldExceedBandwidth) issues.push('bandwidth')
      if (wouldExceedOperations) issues.push('concurrent operations')
      if (wouldExceedConnections) issues.push('concurrent connections')
      reason = `Resource limits exceeded: ${issues.join(', ')}`
    }

    return {
      available,
      currentUsage: { ...this.currentUsage },
      estimatedWaitTime: available ? 0 : this.estimateWaitTime(requirements),
      reason: reason || 'Unknown reason',
    }
  }

  /**
   * Handle resource contention with queuing or rejection
   */
  private async handleResourceContention<T>(
    operation: () => Promise<T>,
    priority: OperationPriority,
    requirements: ResourceRequirements
  ): Promise<Result<T, ResourceContentionError>> {
    if (priority === OperationPriority.HIGH || priority === OperationPriority.CRITICAL) {
      // Queue high priority operations
      return this.queueOperation(operation, priority, requirements)
    }
    // Reject low priority operations with guidance
    const estimatedWait = this.estimateWaitTime(requirements)
    return Err(
      new ResourceContentionError('System busy - try again in a few moments', {
        estimatedWait,
        currentLoad: this.calculateCurrentLoad(),
        suggestion: 'Consider reducing request complexity or trying again later',
      })
    )
  }

  /**
   * Queue operation for later execution
   */
  private async queueOperation<T>(
    operation: () => Promise<T>,
    priority: OperationPriority,
    requirements: ResourceRequirements
  ): Promise<Result<T, ResourceContentionError>> {
    const queuedOperation: QueuedOperation = {
      id: this.generateOperationId(),
      operation: operation as () => Promise<unknown>,
      priority,
      requirements,
      queuedAt: new Date(),
      estimatedDuration: this.estimateOperationDuration(requirements),
    }

    // Insert into queue based on priority
    this.insertIntoQueue(queuedOperation)

    // Wait for operation to be processed
    return new Promise((resolve) => {
      const checkQueue = async () => {
        const resourceCheck = await this.checkResourceAvailability(requirements)

        if (resourceCheck.available && this.operationQueue[0]?.id === queuedOperation.id) {
          // Remove from queue and execute
          this.operationQueue.shift()

          const operationId = queuedOperation.id
          try {
            this.trackOperation(operationId, requirements)
            const result = await queuedOperation.operation()
            resolve(Ok(result as T))
          } catch (error) {
            resolve(
              Err(
                new ResourceContentionError(`Queued operation failed: ${error}`, {
                  operationId,
                  queuedAt: queuedOperation.queuedAt,
                })
              )
            )
          } finally {
            this.releaseOperation(operationId)
          }
        } else {
          // Check again after a delay
          setTimeout(checkQueue, 1000)
        }
      }

      checkQueue()
    })
  }

  /**
   * Insert operation into priority-based queue
   */
  private insertIntoQueue(operation: QueuedOperation): void {
    const priorityOrder: Record<OperationPriority, number> = {
      [OperationPriority.CRITICAL]: 0,
      [OperationPriority.HIGH]: 1,
      [OperationPriority.NORMAL]: 2,
      [OperationPriority.LOW]: 3,
    }

    const insertIndex = this.operationQueue.findIndex(
      (queued) => priorityOrder[queued.priority] > priorityOrder[operation.priority]
    )

    if (insertIndex === -1) {
      this.operationQueue.push(operation)
    } else {
      this.operationQueue.splice(insertIndex, 0, operation)
    }
  }

  /**
   * Track active operation and update resource usage
   */
  private trackOperation(operationId: string, requirements: ResourceRequirements): void {
    const tracking: OperationTracking = {
      id: operationId,
      startTime: new Date(),
      requirements,
      estimatedEndTime: new Date(Date.now() + this.estimateOperationDuration(requirements)),
      actualUsage: {},
    }

    this.activeOperations.set(operationId, tracking)

    // Update current usage
    this.currentUsage.memory += requirements.memory
    this.currentUsage.cpu += requirements.cpu
    this.currentUsage.networkBandwidth += requirements.networkBandwidth
    this.currentUsage.concurrentOperations += 1
    this.currentUsage.concurrentConnections += requirements.concurrentConnections
  }

  /**
   * Release operation and free resources
   */
  private releaseOperation(operationId: string): void {
    const tracking = this.activeOperations.get(operationId)
    if (!tracking) return

    // Update current usage
    this.currentUsage.memory -= tracking.requirements.memory
    this.currentUsage.cpu -= tracking.requirements.cpu
    this.currentUsage.networkBandwidth -= tracking.requirements.networkBandwidth
    this.currentUsage.concurrentOperations -= 1
    this.currentUsage.concurrentConnections -= tracking.requirements.concurrentConnections

    // Ensure no negative values
    this.currentUsage.memory = Math.max(0, this.currentUsage.memory)
    this.currentUsage.cpu = Math.max(0, this.currentUsage.cpu)
    this.currentUsage.networkBandwidth = Math.max(0, this.currentUsage.networkBandwidth)
    this.currentUsage.concurrentOperations = Math.max(0, this.currentUsage.concurrentOperations)
    this.currentUsage.concurrentConnections = Math.max(0, this.currentUsage.concurrentConnections)

    this.activeOperations.delete(operationId)
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `op-${Date.now()}-${this.nextOperationId++}`
  }

  /**
   * Estimate wait time for resource availability
   */
  private estimateWaitTime(requirements: ResourceRequirements): number {
    const activeOps = Array.from(this.activeOperations.values())

    if (activeOps.length === 0) return 0

    // Find the operation that would free enough resources
    const sortedByEndTime = activeOps.sort(
      (a, b) => a.estimatedEndTime.getTime() - b.estimatedEndTime.getTime()
    )

    for (const op of sortedByEndTime) {
      const timeUntilEnd = Math.max(0, op.estimatedEndTime.getTime() - Date.now())

      // Simulate releasing this operation
      const projectedUsage = {
        memory: this.currentUsage.memory - op.requirements.memory,
        cpu: this.currentUsage.cpu - op.requirements.cpu,
        networkBandwidth: this.currentUsage.networkBandwidth - op.requirements.networkBandwidth,
        concurrentOperations: this.currentUsage.concurrentOperations - 1,
        concurrentConnections:
          this.currentUsage.concurrentConnections - op.requirements.concurrentConnections,
      }

      // Check if resources would be available
      const wouldHaveResources =
        projectedUsage.memory + requirements.memory <= this.resourceLimits.maxMemory &&
        projectedUsage.cpu + requirements.cpu <= this.resourceLimits.maxCpu &&
        projectedUsage.networkBandwidth + requirements.networkBandwidth <=
          this.resourceLimits.maxNetworkBandwidth &&
        projectedUsage.concurrentOperations + 1 <= this.resourceLimits.maxConcurrentOperations &&
        projectedUsage.concurrentConnections + requirements.concurrentConnections <=
          this.resourceLimits.maxConcurrentConnections

      if (wouldHaveResources) {
        return timeUntilEnd
      }
    }

    // Fallback: estimate based on average operation duration
    const avgDuration = this.calculateAverageOperationDuration()
    return avgDuration * 0.5 // Conservative estimate
  }

  /**
   * Estimate operation duration based on resource requirements
   */
  private estimateOperationDuration(requirements: ResourceRequirements): number {
    // Base duration on resource complexity
    const memoryFactor = requirements.memory / (1024 * 1024) // MB
    const cpuFactor = requirements.cpu
    const networkFactor = requirements.networkBandwidth / (1024 * 1024) // MB/s

    // Estimate based on empirical factors (in milliseconds)
    const baseDuration = 5000 // 5 seconds base
    const estimatedDuration =
      baseDuration + memoryFactor * 100 + cpuFactor * 200 + networkFactor * 50

    return Math.max(1000, estimatedDuration) // Minimum 1 second
  }

  /**
   * Calculate average operation duration from active operations
   */
  private calculateAverageOperationDuration(): number {
    const activeOps = Array.from(this.activeOperations.values())
    if (activeOps.length === 0) return 10000 // Default 10 seconds

    const totalEstimatedDuration = activeOps.reduce(
      (sum, op) => sum + (op.estimatedEndTime.getTime() - op.startTime.getTime()),
      0
    )

    return totalEstimatedDuration / activeOps.length
  }

  /**
   * Calculate current system load percentage
   */
  private calculateCurrentLoad(): number {
    const memoryLoad = (this.currentUsage.memory / this.resourceLimits.maxMemory) * 100
    const cpuLoad = (this.currentUsage.cpu / this.resourceLimits.maxCpu) * 100
    const networkLoad =
      (this.currentUsage.networkBandwidth / this.resourceLimits.maxNetworkBandwidth) * 100
    const operationLoad =
      (this.currentUsage.concurrentOperations / this.resourceLimits.maxConcurrentOperations) * 100
    const connectionLoad =
      (this.currentUsage.concurrentConnections / this.resourceLimits.maxConcurrentConnections) * 100

    return Math.max(memoryLoad, cpuLoad, networkLoad, operationLoad, connectionLoad)
  }

  /**
   * Get current system status
   */
  getSystemStatus() {
    return {
      currentUsage: { ...this.currentUsage },
      resourceLimits: { ...this.resourceLimits },
      activeOperations: this.activeOperations.size,
      queuedOperations: this.operationQueue.length,
      currentLoad: this.calculateCurrentLoad(),
    }
  }

  /**
   * Force cleanup of stale operations
   */
  cleanup(): void {
    const now = Date.now()
    const staleThreshold = 5 * 60 * 1000 // 5 minutes

    for (const [id, tracking] of this.activeOperations.entries()) {
      if (now - tracking.startTime.getTime() > staleThreshold) {
        this.releaseOperation(id)
      }
    }

    // Clean up old queued operations
    const maxQueueAge = 10 * 60 * 1000 // 10 minutes
    let i = 0
    while (i < this.operationQueue.length) {
      const queuedOp = this.operationQueue[i]
      if (queuedOp && now - queuedOp.queuedAt.getTime() > maxQueueAge) {
        this.operationQueue.splice(i, 1)
      } else {
        i++
      }
    }
  }
}
