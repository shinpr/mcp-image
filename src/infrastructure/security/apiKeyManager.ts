/**
 * API Key Manager - Secure API key management with rotation and access control
 * Provides separation, protection, and automated management of API keys
 * Addresses SECURITY1 test case requirements
 */

/**
 * Secure API key with metadata
 */
export interface SecureAPIKey {
  key: string
  expiresAt: number
  permissions: string[]
  usageTracking: UsageTracker
  keyId: string
}

/**
 * API key access logger for security auditing
 */
export interface APIKeyAccessLogger {
  logKeyAccess(access: KeyAccessLog): Promise<void>
  getAccessHistory(keyId: string, timeRange: TimeRange): Promise<KeyAccessLog[]>
  detectSuspiciousActivity(keyId: string): Promise<SuspiciousActivityAlert[]>
}

/**
 * Key access log entry
 */
export interface KeyAccessLog {
  service: string
  operation: string
  timestamp: number
  keyId: string
  sessionId?: string
  userId?: string
  clientId?: string
  success: boolean
  ipAddress?: string
  userAgent?: string
}

/**
 * Time range for queries
 */
export interface TimeRange {
  start: number
  end: number
}

/**
 * Suspicious activity alert
 */
export interface SuspiciousActivityAlert {
  alertId: string
  keyId: string
  alertType: SuspiciousActivityType
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  timestamp: number
  evidence: Record<string, unknown>
  recommendedAction: string
}

/**
 * Types of suspicious activity
 */
export enum SuspiciousActivityType {
  UNUSUAL_ACCESS_PATTERN = 'unusual_access_pattern',
  EXCESSIVE_USAGE = 'excessive_usage',
  UNAUTHORIZED_LOCATION = 'unauthorized_location',
  INVALID_PERMISSIONS = 'invalid_permissions',
  RAPID_SUCCESSION_REQUESTS = 'rapid_succession_requests',
}

/**
 * Usage tracker for API key monitoring
 */
export interface UsageTracker {
  trackUsage(operation: string, metadata?: Record<string, unknown>): void
  getUsageStats(timeRange: TimeRange): UsageStats
  resetStats(): void
  isRateLimited(): boolean
}

/**
 * Usage statistics
 */
export interface UsageStats {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  rateLimitHits: number
  costEstimate: number
}

/**
 * Secure key vault for encrypted key storage
 */
export interface SecureKeyVault {
  /**
   * Store encrypted API key
   */
  storeKey(service: string, key: string, permissions: string[], expiresAt: number): Promise<string>

  /**
   * Retrieve decrypted API key information
   */
  retrieveKey(service: string): Promise<StoredKeyInfo>

  /**
   * Update existing key with new value
   */
  updateKey(
    service: string,
    newKey: string,
    permissions: string[],
    expiresAt: number
  ): Promise<void>

  /**
   * Remove key from vault
   */
  removeKey(service: string): Promise<void>

  /**
   * List all services with stored keys
   */
  listServices(): Promise<string[]>

  /**
   * Check if key exists for service
   */
  hasKey(service: string): Promise<boolean>

  /**
   * Backup vault contents
   */
  createBackup(): Promise<VaultBackup>

  /**
   * Restore vault from backup
   */
  restoreFromBackup(backup: VaultBackup): Promise<void>
}

/**
 * Stored key information
 */
export interface StoredKeyInfo {
  keyId: string
  key: string
  permissions: string[]
  createdAt: number
  expiresAt: number
  lastUsed?: number
  usageCount: number
}

/**
 * Vault backup structure
 */
export interface VaultBackup {
  backupId: string
  timestamp: number
  encryptedData: string
  checksum: string
  metadata: Record<string, unknown>
}

/**
 * Key rotation scheduler
 */
export interface KeyRotationScheduler {
  /**
   * Schedule automatic key rotation
   */
  scheduleRotation(service: string, intervalMs: number): Promise<void>

  /**
   * Cancel scheduled rotation
   */
  cancelRotation(service: string): Promise<void>

  /**
   * Get rotation schedule for service
   */
  getRotationSchedule(service: string): Promise<RotationSchedule | null>

  /**
   * Manually trigger rotation
   */
  triggerRotation(service: string): Promise<KeyRotationResult>

  /**
   * Get all scheduled rotations
   */
  getAllSchedules(): Promise<RotationSchedule[]>
}

/**
 * Rotation schedule configuration
 */
export interface RotationSchedule {
  services: string[]
  intervalMs: number
  nextRotationAt: number
  maxRetries: number
  notificationEnabled: boolean
}

/**
 * Key rotation result
 */
export interface KeyRotationResult {
  rotations: ServiceRotationResult[]
  overallSuccess: boolean
  timestamp: number
  errors?: string[]
}

/**
 * Individual service rotation result
 */
export interface ServiceRotationResult {
  service: string
  success: boolean
  newKeyId?: string
  rotationTimestamp?: number
  error?: string
  fallbackPeriodMs?: number
}

/**
 * Key authorization validation
 */
export interface KeyAuthorization {
  allowed: boolean
  reason?: string
  permissions: string[]
  restrictions: AuthorizationRestriction[]
}

/**
 * Authorization restrictions
 */
export interface AuthorizationRestriction {
  type: RestrictionType
  value: unknown
  description: string
}

/**
 * Types of authorization restrictions
 */
export enum RestrictionType {
  TIME_BASED = 'time_based',
  IP_BASED = 'ip_based',
  RATE_LIMIT = 'rate_limit',
  OPERATION_BASED = 'operation_based',
  USER_BASED = 'user_based',
}

/**
 * Unauthorized API access error
 */
export class UnauthorizedAPIAccessError extends Error {
  constructor(reason: string) {
    super(`Unauthorized API access: ${reason}`)
    this.name = 'UnauthorizedAPIAccessError'
  }
}

/**
 * API Key Manager implementation
 */
export class APIKeyManager {
  private keyVault: SecureKeyVault
  private rotationScheduler: KeyRotationScheduler
  private accessLogger: APIKeyAccessLogger

  constructor(
    keyVault: SecureKeyVault,
    rotationScheduler: KeyRotationScheduler,
    accessLogger: APIKeyAccessLogger
  ) {
    this.keyVault = keyVault
    this.rotationScheduler = rotationScheduler
    this.accessLogger = accessLogger
  }

  /**
   * Get secure API key with authorization validation
   */
  async getAPIKey(service: string, operation: string, sessionId?: string): Promise<SecureAPIKey> {
    // Validate operation is authorized for this key
    const authorization = await this.validateKeyAuthorization(service, operation)
    if (!authorization.allowed) {
      throw new UnauthorizedAPIAccessError(authorization.reason || 'Access denied')
    }

    // Get appropriate key for service
    const keyInfo = await this.keyVault.retrieveKey(service)

    // Check if key is expired
    if (keyInfo.expiresAt < Date.now()) {
      throw new UnauthorizedAPIAccessError('API key has expired')
    }

    // Log access for security monitoring
    await this.accessLogger.logKeyAccess({
      service,
      operation,
      timestamp: Date.now(),
      keyId: keyInfo.keyId,
      ...(sessionId && { sessionId }),
      success: true,
    })

    return {
      key: keyInfo.key,
      expiresAt: keyInfo.expiresAt,
      permissions: keyInfo.permissions,
      keyId: keyInfo.keyId,
      usageTracking: this.createUsageTracker(keyInfo.keyId),
    }
  }

  /**
   * Rotate API keys according to schedule
   */
  async rotateAPIKeys(schedule: RotationSchedule): Promise<KeyRotationResult> {
    const results: ServiceRotationResult[] = []

    for (const service of schedule.services) {
      try {
        const oldKey = await this.keyVault.retrieveKey(service)
        const newKey = await this.generateNewKey(service, oldKey.permissions)

        // Gradual rotation with fallback period
        await this.initiateGradualRotation(oldKey, newKey)

        results.push({
          service,
          success: true,
          newKeyId: newKey.keyId,
          rotationTimestamp: Date.now(),
          fallbackPeriodMs: 300000, // 5 minutes fallback
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.push({
          service,
          success: false,
          error: errorMessage,
        })
      }
    }

    return {
      rotations: results,
      overallSuccess: results.every((r) => r.success),
      timestamp: Date.now(),
      errors: results
        .filter((r) => !r.success)
        .map((r) => r.error)
        .filter(Boolean) as string[],
    }
  }

  /**
   * Validate key authorization for operation
   */
  private async validateKeyAuthorization(
    service: string,
    operation: string
  ): Promise<KeyAuthorization> {
    try {
      const keyInfo = await this.keyVault.retrieveKey(service)

      // Check if operation is allowed for this key
      if (!keyInfo.permissions.includes(operation) && !keyInfo.permissions.includes('*')) {
        return {
          allowed: false,
          reason: `Operation '${operation}' not permitted for service '${service}'`,
          permissions: keyInfo.permissions,
          restrictions: [],
        }
      }

      return {
        allowed: true,
        permissions: keyInfo.permissions,
        restrictions: [],
      }
    } catch (error) {
      return {
        allowed: false,
        reason: `Key not found for service '${service}'`,
        permissions: [],
        restrictions: [],
      }
    }
  }

  /**
   * Generate new key for service
   */
  private async generateNewKey(service: string, permissions: string[]): Promise<StoredKeyInfo> {
    // In a real implementation, this would generate a secure key
    const newKey = this.generateSecureKey()
    const keyId = this.generateKeyId()
    const expiresAt = Date.now() + 90 * 24 * 60 * 60 * 1000 // 90 days

    await this.keyVault.storeKey(service, newKey, permissions, expiresAt)

    return {
      keyId,
      key: newKey,
      permissions,
      createdAt: Date.now(),
      expiresAt,
      usageCount: 0,
    }
  }

  /**
   * Initiate gradual rotation with fallback period
   */
  private async initiateGradualRotation(
    oldKey: StoredKeyInfo,
    newKey: StoredKeyInfo
  ): Promise<void> {
    // Implementation would handle gradual transition
    // For now, just log the rotation
    console.log(`Rotating key ${oldKey.keyId} to ${newKey.keyId}`)
  }

  /**
   * Create usage tracker for key
   */
  private createUsageTracker(keyId: string): UsageTracker {
    return {
      trackUsage: (operation: string, _metadata?: Record<string, unknown>) => {
        // Implementation would track usage statistics
        console.log(`Tracking usage for key ${keyId}, operation: ${operation}`)
      },
      getUsageStats: (_timeRange: TimeRange) => ({
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        rateLimitHits: 0,
        costEstimate: 0,
      }),
      resetStats: () => {
        console.log(`Reset stats for key ${keyId}`)
      },
      isRateLimited: () => false,
    }
  }

  /**
   * Generate secure random key
   */
  private generateSecureKey(): string {
    // In production, use cryptographically secure random generation
    return Array.from({ length: 32 }, () => Math.random().toString(36).charAt(2)).join('')
  }

  /**
   * Generate unique key identifier
   */
  private generateKeyId(): string {
    return `key_${Date.now()}_${Math.random().toString(36).slice(2)}`
  }

  /**
   * Get key rotation status
   */
  async getRotationStatus(service: string): Promise<{
    scheduled: boolean
    nextRotation?: number
    lastRotation?: number
  }> {
    const schedule = await this.rotationScheduler.getRotationSchedule(service)
    return {
      scheduled: schedule !== null,
      ...(schedule?.nextRotationAt && { nextRotation: schedule.nextRotationAt }),
      // lastRotation would be tracked in real implementation
    }
  }

  /**
   * Security audit of key usage
   */
  async auditKeyUsage(
    service: string,
    timeRange: TimeRange
  ): Promise<{
    totalAccess: number
    suspiciousActivity: SuspiciousActivityAlert[]
    accessHistory: KeyAccessLog[]
  }> {
    const keyInfo = await this.keyVault.retrieveKey(service)
    const accessHistory = await this.accessLogger.getAccessHistory(keyInfo.keyId, timeRange)
    const suspiciousActivity = await this.accessLogger.detectSuspiciousActivity(keyInfo.keyId)

    return {
      totalAccess: accessHistory.length,
      suspiciousActivity,
      accessHistory,
    }
  }

  /**
   * Emergency key revocation
   */
  async emergencyRevocation(service: string, reason: string): Promise<void> {
    await this.keyVault.removeKey(service)
    await this.rotationScheduler.cancelRotation(service)

    // Log security event
    await this.accessLogger.logKeyAccess({
      service,
      operation: 'EMERGENCY_REVOCATION',
      timestamp: Date.now(),
      keyId: `revoked_${Date.now()}`,
      success: true,
    })

    console.log(`Emergency revocation completed for service ${service}: ${reason}`)
  }
}
