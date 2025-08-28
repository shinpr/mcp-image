/**
 * Concurrency Manager - Controls concurrent request execution
 * Implements singleton pattern with queue management
 */

/**
 * Queued request interface
 */
interface QueuedRequest {
  resolve: (value: undefined) => void
  reject: (error: Error) => void
  timestamp: number
}

/**
 * Concurrency manager for limiting concurrent requests
 */
export class ConcurrencyManager {
  private static instance: ConcurrencyManager
  private activeRequests = 0
  private readonly maxConcurrent = 1
  private requestQueue: QueuedRequest[] = []
  private readonly queueTimeout = 30000 // 30 seconds

  /**
   * Get singleton instance of ConcurrencyManager
   * @returns ConcurrencyManager instance
   */
  static getInstance(): ConcurrencyManager {
    if (!ConcurrencyManager.instance) {
      ConcurrencyManager.instance = new ConcurrencyManager()
    }
    return ConcurrencyManager.instance
  }

  /**
   * Acquire a concurrency lock
   * @returns Promise that resolves when lock is acquired
   */
  async acquireLock(): Promise<void> {
    if (this.activeRequests < this.maxConcurrent) {
      this.activeRequests++
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      const request: QueuedRequest = {
        resolve,
        reject,
        timestamp: Date.now(),
      }

      this.requestQueue.push(request)

      // Set timeout for this request
      const timeoutId = setTimeout(() => {
        const index = this.requestQueue.findIndex((req) => req === request)
        if (index >= 0) {
          this.requestQueue.splice(index, 1)
          reject(new Error('Concurrency limit timeout'))
        }
      }, this.queueTimeout)

      // Clear timeout when request resolves
      const originalResolve = request.resolve
      request.resolve = () => {
        clearTimeout(timeoutId)
        originalResolve(undefined)
      }

      const originalReject = request.reject
      request.reject = (error: Error) => {
        clearTimeout(timeoutId)
        originalReject(error)
      }
    })
  }

  /**
   * Release a concurrency lock
   */
  releaseLock(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1)

    // Process next request in queue
    this.processNextRequest()
  }

  /**
   * Process the next request in the queue
   */
  private processNextRequest(): void {
    // Clean up expired requests first
    this.cleanupExpiredRequests()

    if (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const next = this.requestQueue.shift()
      if (next) {
        this.activeRequests++
        next.resolve(undefined)
      }
    }
  }

  /**
   * Clean up expired requests from the queue
   */
  private cleanupExpiredRequests(): void {
    const now = Date.now()
    const initialLength = this.requestQueue.length

    this.requestQueue = this.requestQueue.filter((request) => {
      const isExpired = now - request.timestamp > this.queueTimeout
      if (isExpired) {
        request.reject(new Error('Request expired in queue'))
        return false
      }
      return true
    })

    // Log cleanup if any requests were removed
    const removedCount = initialLength - this.requestQueue.length
    if (removedCount > 0) {
      console.warn(`[ConcurrencyManager] Cleaned up ${removedCount} expired requests from queue`)
    }
  }

  /**
   * Check if concurrency limit is reached
   * @returns True if at limit
   */
  isAtLimit(): boolean {
    return this.activeRequests >= this.maxConcurrent
  }

  /**
   * Get current queue length
   * @returns Number of queued requests
   */
  getQueueLength(): number {
    return this.requestQueue.length
  }

  /**
   * Get current active request count
   * @returns Number of active requests
   */
  getActiveRequestCount(): number {
    return this.activeRequests
  }

  /**
   * Reset the concurrency manager (for testing purposes)
   */
  reset(): void {
    this.activeRequests = 0
    this.requestQueue = []
  }
}
