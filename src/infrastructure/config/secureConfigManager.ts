/**
 * Secure Configuration Manager - Encrypted configuration with access control and auditing
 * Provides secure storage, retrieval, and management of configuration data
 * Addresses CONFIG4, CONFIG5 requirements and supports security framework
 */

/**
 * Secure configuration data structure
 */
export interface SecureConfig {
  config: ConfigData
  metadata: ConfigMetadata
}

/**
 * Configuration data (generic structure)
 */
export interface ConfigData {
  [key: string]: unknown
}

/**
 * Configuration metadata
 */
export interface ConfigMetadata {
  lastUpdated: number
  version: string
  checksum: string
  encryptedAt?: number
  updatedBy?: string
}

/**
 * Encrypted configuration store
 */
export interface EncryptedConfigStore {
  store(component: string, encryptedData: EncryptedConfigData): Promise<void>
  retrieve(component: string): Promise<EncryptedConfigData>
  exists(component: string): Promise<boolean>
  delete(component: string): Promise<void>
  list(): Promise<string[]>
  backup(): Promise<ConfigBackup>
  restore(backup: ConfigBackup): Promise<void>
}

/**
 * Encrypted configuration data
 */
export interface EncryptedConfigData {
  encryptedContent: string
  encryptionMethod: string
  lastUpdated: number
  version: string
  checksum: string
  salt?: string
  iv?: string
}

/**
 * Configuration backup
 */
export interface ConfigBackup {
  backupId: string
  timestamp: number
  components: Record<string, EncryptedConfigData>
  metadata: {
    totalComponents: number
    backupSize: number
    checksum: string
  }
}

/**
 * Configuration validator
 */
export interface ConfigValidator {
  validate(component: string, config: ConfigData): Promise<ConfigValidationResult>
  getSchema(component: string): ConfigSchema | null
  registerSchema(component: string, schema: ConfigSchema): void
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  valid: boolean
  errors: ConfigValidationError[]
  warnings: ConfigValidationWarning[]
}

/**
 * Configuration validation error
 */
export interface ConfigValidationError {
  field: string
  message: string
  severity: 'error' | 'warning'
  code: string
}

/**
 * Configuration validation warning
 */
export interface ConfigValidationWarning {
  field: string
  message: string
  recommendation: string
  code: string
}

/**
 * Configuration schema definition
 */
export interface ConfigSchema {
  type: 'object'
  properties: Record<string, ConfigPropertySchema>
  required?: string[]
  additionalProperties?: boolean
}

/**
 * Configuration property schema
 */
export interface ConfigPropertySchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description?: string
  required?: boolean
  default?: unknown
  enum?: unknown[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  items?: ConfigPropertySchema
  properties?: Record<string, ConfigPropertySchema>
}

/**
 * Configuration audit logger
 */
export interface ConfigAuditLogger {
  logAccess(event: ConfigAccessEvent): Promise<void>
  logUpdate(event: ConfigUpdateEvent): Promise<void>
  logDeletion(event: ConfigDeletionEvent): Promise<void>
  getAuditHistory(component: string, timeRange: TimeRange): Promise<ConfigAuditEvent[]>
  searchAuditLogs(criteria: AuditSearchCriteria): Promise<ConfigAuditEvent[]>
}

/**
 * Configuration access event
 */
export interface ConfigAccessEvent {
  component: string
  timestamp: number
  accessType: 'read' | 'list' | 'exists'
  userId?: string
  sessionId?: string
  ipAddress?: string
  success: boolean
  error?: string
}

/**
 * Configuration update event
 */
export interface ConfigUpdateEvent {
  component: string
  timestamp: number
  updatedBy: string
  backupId: string
  changes?: ConfigChange[]
  success: boolean
  error?: string
}

/**
 * Configuration deletion event
 */
export interface ConfigDeletionEvent {
  component: string
  timestamp: number
  deletedBy: string
  reason: string
  backupId: string
  success: boolean
  error?: string
}

/**
 * Generic configuration audit event
 */
export interface ConfigAuditEvent {
  eventId: string
  eventType: 'access' | 'update' | 'deletion' | 'backup' | 'restore'
  component: string
  timestamp: number
  userId?: string
  details: Record<string, unknown>
  success: boolean
  error?: string
}

/**
 * Configuration change details
 */
export interface ConfigChange {
  field: string
  oldValue: unknown
  newValue: unknown
  changeType: 'added' | 'modified' | 'removed'
}

/**
 * Time range for queries
 */
export interface TimeRange {
  start: number
  end: number
}

/**
 * Audit search criteria
 */
export interface AuditSearchCriteria {
  component?: string
  eventType?: string
  userId?: string
  timeRange?: TimeRange
  success?: boolean
  limit?: number
  offset?: number
}

/**
 * Configuration update authorization
 */
export interface ConfigUpdateAuthorization {
  userId: string
  permissions: string[]
  sessionId: string
  timestamp: number
  reason?: string
}

/**
 * Authorization validation result
 */
export interface AuthorizationResult {
  authorized: boolean
  reason?: string
  permissions: string[]
  restrictions: string[]
}

/**
 * Configuration update result
 */
export interface ConfigUpdateResult {
  success: boolean
  backupId?: string
  errors?: ConfigValidationError[]
  warnings?: ConfigValidationWarning[]
}

/**
 * Configuration errors
 */
export class InvalidConfigurationError extends Error {
  constructor(errors: ConfigValidationError[]) {
    super(`Invalid configuration: ${errors.map((e) => e.message).join(', ')}`)
    this.name = 'InvalidConfigurationError'
  }
}

export class UnauthorizedConfigUpdateError extends Error {
  constructor(reason: string) {
    super(`Unauthorized configuration update: ${reason}`)
    this.name = 'UnauthorizedConfigUpdateError'
  }
}

export class ConfigurationUpdateFailedError extends Error {
  constructor(message: string) {
    super(`Configuration update failed: ${message}`)
    this.name = 'ConfigurationUpdateFailedError'
  }
}

/**
 * Simple in-memory encrypted config store implementation
 */
class SimpleEncryptedConfigStore implements EncryptedConfigStore {
  private configStore = new Map<string, EncryptedConfigData>()

  async store(component: string, encryptedData: EncryptedConfigData): Promise<void> {
    this.configStore.set(component, { ...encryptedData })
  }

  async retrieve(component: string): Promise<EncryptedConfigData> {
    const data = this.configStore.get(component)
    if (!data) {
      throw new Error(`Configuration not found for component: ${component}`)
    }
    return { ...data }
  }

  async exists(component: string): Promise<boolean> {
    return this.configStore.has(component)
  }

  async delete(component: string): Promise<void> {
    this.configStore.delete(component)
  }

  async list(): Promise<string[]> {
    return Array.from(this.configStore.keys())
  }

  async backup(): Promise<ConfigBackup> {
    const components: Record<string, EncryptedConfigData> = {}
    let totalSize = 0

    for (const [component, data] of this.configStore.entries()) {
      components[component] = { ...data }
      totalSize += JSON.stringify(data).length
    }

    const backupContent = JSON.stringify(components)
    const checksum = this.generateChecksum(backupContent)

    return {
      backupId: `backup_${Date.now()}`,
      timestamp: Date.now(),
      components,
      metadata: {
        totalComponents: this.configStore.size,
        backupSize: totalSize,
        checksum,
      },
    }
  }

  async restore(backup: ConfigBackup): Promise<void> {
    // Validate backup checksum
    const backupContent = JSON.stringify(backup.components)
    const checksum = this.generateChecksum(backupContent)

    if (checksum !== backup.metadata.checksum) {
      throw new Error('Backup checksum validation failed')
    }

    // Clear current store and restore from backup
    this.configStore.clear()
    for (const [component, data] of Object.entries(backup.components)) {
      this.configStore.set(component, data)
    }
  }

  private generateChecksum(data: string): string {
    // Simple checksum implementation (in production, use crypto)
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString(16)
  }
}

/**
 * Simple configuration validator implementation
 */
class SimpleConfigValidator implements ConfigValidator {
  private schemas = new Map<string, ConfigSchema>()

  async validate(component: string, config: ConfigData): Promise<ConfigValidationResult> {
    const schema = this.schemas.get(component)
    if (!schema) {
      return {
        valid: true,
        errors: [],
        warnings: [
          {
            field: component,
            message: `No schema defined for component ${component}`,
            recommendation: 'Consider defining a schema for better validation',
            code: 'NO_SCHEMA',
          },
        ],
      }
    }

    return this.validateAgainstSchema(config, schema)
  }

  getSchema(component: string): ConfigSchema | null {
    return this.schemas.get(component) || null
  }

  registerSchema(component: string, schema: ConfigSchema): void {
    this.schemas.set(component, schema)
  }

  private validateAgainstSchema(config: ConfigData, schema: ConfigSchema): ConfigValidationResult {
    const errors: ConfigValidationError[] = []
    const warnings: ConfigValidationWarning[] = []

    // Check required properties
    if (schema.required) {
      for (const requiredField of schema.required) {
        if (!(requiredField in config)) {
          errors.push({
            field: requiredField,
            message: `Required field '${requiredField}' is missing`,
            severity: 'error',
            code: 'REQUIRED_FIELD_MISSING',
          })
        }
      }
    }

    // Validate each property
    for (const [field, value] of Object.entries(config)) {
      const propertySchema = schema.properties[field]
      if (!propertySchema) {
        if (!schema.additionalProperties) {
          warnings.push({
            field,
            message: `Unknown field '${field}'`,
            recommendation: 'Remove unknown field or update schema',
            code: 'UNKNOWN_FIELD',
          })
        }
        continue
      }

      const validation = this.validateProperty(field, value, propertySchema)
      errors.push(...validation.errors)
      warnings.push(...validation.warnings)
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  private validateProperty(
    field: string,
    value: unknown,
    schema: ConfigPropertySchema
  ): { errors: ConfigValidationError[]; warnings: ConfigValidationWarning[] } {
    const errors: ConfigValidationError[] = []
    const warnings: ConfigValidationWarning[] = []

    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value
    if (actualType !== schema.type) {
      errors.push({
        field,
        message: `Expected type '${schema.type}' but got '${actualType}'`,
        severity: 'error',
        code: 'TYPE_MISMATCH',
      })
      return { errors, warnings }
    }

    // String validations
    if (schema.type === 'string' && typeof value === 'string') {
      if (schema.minLength && value.length < schema.minLength) {
        errors.push({
          field,
          message: `String length ${value.length} is less than minimum ${schema.minLength}`,
          severity: 'error',
          code: 'MIN_LENGTH_VIOLATION',
        })
      }

      if (schema.maxLength && value.length > schema.maxLength) {
        errors.push({
          field,
          message: `String length ${value.length} exceeds maximum ${schema.maxLength}`,
          severity: 'error',
          code: 'MAX_LENGTH_VIOLATION',
        })
      }

      if (schema.pattern) {
        const regex = new RegExp(schema.pattern)
        if (!regex.test(value)) {
          errors.push({
            field,
            message: `Value '${value}' does not match required pattern`,
            severity: 'error',
            code: 'PATTERN_MISMATCH',
          })
        }
      }
    }

    // Number validations
    if (schema.type === 'number' && typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({
          field,
          message: `Value ${value} is less than minimum ${schema.minimum}`,
          severity: 'error',
          code: 'MIN_VALUE_VIOLATION',
        })
      }

      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({
          field,
          message: `Value ${value} exceeds maximum ${schema.maximum}`,
          severity: 'error',
          code: 'MAX_VALUE_VIOLATION',
        })
      }
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({
        field,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        severity: 'error',
        code: 'ENUM_VIOLATION',
      })
    }

    return { errors, warnings }
  }
}

/**
 * Simple configuration audit logger implementation
 */
class SimpleConfigAuditLogger implements ConfigAuditLogger {
  private auditLogs: ConfigAuditEvent[] = []

  async logAccess(event: ConfigAccessEvent): Promise<void> {
    this.auditLogs.push({
      eventId: `access_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      eventType: 'access',
      component: event.component,
      timestamp: event.timestamp,
      ...(event.userId && { userId: event.userId }),
      details: {
        accessType: event.accessType,
        sessionId: event.sessionId,
        ipAddress: event.ipAddress,
      },
      success: event.success,
      ...(event.error && { error: event.error }),
    })
  }

  async logUpdate(event: ConfigUpdateEvent): Promise<void> {
    this.auditLogs.push({
      eventId: `update_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      eventType: 'update',
      component: event.component,
      timestamp: event.timestamp,
      userId: event.updatedBy,
      details: {
        backupId: event.backupId,
        changes: event.changes,
      },
      success: event.success,
      ...(event.error && { error: event.error }),
    })
  }

  async logDeletion(event: ConfigDeletionEvent): Promise<void> {
    this.auditLogs.push({
      eventId: `deletion_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      eventType: 'deletion',
      component: event.component,
      timestamp: event.timestamp,
      userId: event.deletedBy,
      details: {
        reason: event.reason,
        backupId: event.backupId,
      },
      success: event.success,
      ...(event.error && { error: event.error }),
    })
  }

  async getAuditHistory(component: string, timeRange: TimeRange): Promise<ConfigAuditEvent[]> {
    return this.auditLogs.filter(
      (log) =>
        log.component === component &&
        log.timestamp >= timeRange.start &&
        log.timestamp <= timeRange.end
    )
  }

  async searchAuditLogs(criteria: AuditSearchCriteria): Promise<ConfigAuditEvent[]> {
    let filtered = this.auditLogs

    if (criteria.component) {
      filtered = filtered.filter((log) => log.component === criteria.component)
    }

    if (criteria.eventType) {
      filtered = filtered.filter((log) => log.eventType === criteria.eventType)
    }

    if (criteria.userId) {
      filtered = filtered.filter((log) => log.userId === criteria.userId)
    }

    if (criteria.success !== undefined) {
      filtered = filtered.filter((log) => log.success === criteria.success)
    }

    if (criteria.timeRange) {
      filtered = filtered.filter(
        (log) =>
          log.timestamp >= criteria.timeRange!.start && log.timestamp <= criteria.timeRange!.end
      )
    }

    // Apply offset and limit
    const start = criteria.offset || 0
    const end = criteria.limit ? start + criteria.limit : undefined

    return filtered.slice(start, end)
  }
}

/**
 * Secure Configuration Manager - Main implementation
 */
export class SecureConfigManager {
  private encryptedConfig: EncryptedConfigStore
  private configValidators: Map<string, ConfigValidator>
  private configAuditLogger: ConfigAuditLogger

  constructor() {
    this.encryptedConfig = new SimpleEncryptedConfigStore()
    this.configValidators = new Map()
    this.configAuditLogger = new SimpleConfigAuditLogger()

    // Register default validator
    this.configValidators.set('default', new SimpleConfigValidator())
  }

  /**
   * Get secure configuration for component
   */
  async getSecureConfiguration(component: string, userId?: string): Promise<SecureConfig> {
    try {
      const encryptedData = await this.encryptedConfig.retrieve(component)
      const decryptedConfig = await this.decryptConfiguration(encryptedData)

      // Validate configuration before use
      const validation = await this.validateConfiguration(component, decryptedConfig)
      if (!validation.valid) {
        throw new InvalidConfigurationError(validation.errors)
      }

      // Audit configuration access
      await this.configAuditLogger.logAccess({
        component,
        timestamp: Date.now(),
        accessType: 'read',
        ...(userId && { userId }),
        success: true,
      })

      return {
        config: decryptedConfig,
        metadata: {
          lastUpdated: encryptedData.lastUpdated,
          version: encryptedData.version,
          checksum: encryptedData.checksum,
        },
      }
    } catch (error) {
      // Log failed access
      await this.configAuditLogger.logAccess({
        component,
        timestamp: Date.now(),
        accessType: 'read',
        ...(userId && { userId }),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }

  /**
   * Update secure configuration
   */
  async updateSecureConfiguration(
    component: string,
    newConfig: ConfigData,
    authorization: ConfigUpdateAuthorization
  ): Promise<ConfigUpdateResult> {
    try {
      // Validate authorization for configuration update
      const authResult = await this.validateUpdateAuthorization(authorization)
      if (!authResult.authorized) {
        throw new UnauthorizedConfigUpdateError(authResult.reason || 'Access denied')
      }

      // Validate new configuration
      const validation = await this.validateConfiguration(component, newConfig)
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors,
          warnings: validation.warnings,
        }
      }

      // Create backup of current configuration
      const backup = await this.createConfigurationBackup(component)

      try {
        // Encrypt and store new configuration
        const encrypted = await this.encryptConfiguration(newConfig)
        await this.encryptedConfig.store(component, encrypted)

        // Audit configuration change
        await this.configAuditLogger.logUpdate({
          component,
          timestamp: Date.now(),
          updatedBy: authorization.userId,
          backupId: backup.id,
          success: true,
        })

        return {
          success: true,
          backupId: backup.id,
          warnings: validation.warnings,
        }
      } catch (error) {
        // Restore from backup on failure
        await this.restoreFromBackup(component, backup.id)
        throw new ConfigurationUpdateFailedError(
          error instanceof Error ? error.message : 'Unknown error'
        )
      }
    } catch (error) {
      // Log failed update
      await this.configAuditLogger.logUpdate({
        component,
        timestamp: Date.now(),
        updatedBy: authorization.userId,
        backupId: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      if (
        error instanceof UnauthorizedConfigUpdateError ||
        error instanceof InvalidConfigurationError
      ) {
        throw error
      }

      return {
        success: false,
        errors: [
          {
            field: 'system',
            message: error instanceof Error ? error.message : 'Unknown error',
            severity: 'error',
            code: 'UPDATE_FAILED',
          },
        ],
      }
    }
  }

  /**
   * Decrypt configuration data
   */
  private async decryptConfiguration(encryptedData: EncryptedConfigData): Promise<ConfigData> {
    // Simple decryption implementation (in production, use proper crypto)
    try {
      const decrypted = Buffer.from(encryptedData.encryptedContent, 'base64').toString('utf8')
      return JSON.parse(decrypted)
    } catch (error) {
      throw new Error('Failed to decrypt configuration data')
    }
  }

  /**
   * Encrypt configuration data
   */
  private async encryptConfiguration(config: ConfigData): Promise<EncryptedConfigData> {
    // Simple encryption implementation (in production, use proper crypto)
    const content = JSON.stringify(config)
    const encrypted = Buffer.from(content).toString('base64')
    const checksum = this.generateChecksum(content)

    return {
      encryptedContent: encrypted,
      encryptionMethod: 'base64', // In production: 'AES-256-GCM'
      lastUpdated: Date.now(),
      version: '1.0.0',
      checksum,
    }
  }

  /**
   * Validate configuration
   */
  private async validateConfiguration(
    component: string,
    config: ConfigData
  ): Promise<ConfigValidationResult> {
    const validator = this.configValidators.get(component) || this.configValidators.get('default')!
    return validator.validate(component, config)
  }

  /**
   * Validate update authorization
   */
  private async validateUpdateAuthorization(
    authorization: ConfigUpdateAuthorization
  ): Promise<AuthorizationResult> {
    // Basic authorization validation (in production, integrate with proper auth system)
    if (!authorization.userId) {
      return {
        authorized: false,
        reason: 'User ID is required',
        permissions: [],
        restrictions: [],
      }
    }

    if (
      !authorization.permissions.includes('config:write') &&
      !authorization.permissions.includes('admin')
    ) {
      return {
        authorized: false,
        reason: 'Insufficient permissions for configuration update',
        permissions: authorization.permissions,
        restrictions: ['config:write required'],
      }
    }

    return {
      authorized: true,
      permissions: authorization.permissions,
      restrictions: [],
    }
  }

  /**
   * Create configuration backup
   */
  private async createConfigurationBackup(
    component: string
  ): Promise<{ id: string; timestamp: number }> {
    const backup = await this.encryptedConfig.backup()

    // In production, store backup securely
    console.log(`Created backup ${backup.backupId} for component ${component}`)

    return {
      id: backup.backupId,
      timestamp: backup.timestamp,
    }
  }

  /**
   * Restore from backup
   */
  private async restoreFromBackup(component: string, backupId: string): Promise<void> {
    // In production, restore from actual backup storage
    console.log(`Restoring component ${component} from backup ${backupId}`)
  }

  /**
   * Generate checksum
   */
  private generateChecksum(data: string): string {
    // Simple checksum implementation (in production, use crypto)
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return hash.toString(16)
  }

  /**
   * Register configuration schema
   */
  registerSchema(component: string, schema: ConfigSchema): void {
    if (!this.configValidators.has(component)) {
      this.configValidators.set(component, new SimpleConfigValidator())
    }

    const validator = this.configValidators.get(component)!
    validator.registerSchema(component, schema)
  }

  /**
   * Get configuration audit history
   */
  async getAuditHistory(component: string, timeRange: TimeRange): Promise<ConfigAuditEvent[]> {
    return this.configAuditLogger.getAuditHistory(component, timeRange)
  }

  /**
   * Delete configuration
   */
  async deleteConfiguration(
    component: string,
    authorization: ConfigUpdateAuthorization,
    reason: string
  ): Promise<void> {
    const authResult = await this.validateUpdateAuthorization(authorization)
    if (!authResult.authorized) {
      throw new UnauthorizedConfigUpdateError(authResult.reason || 'Access denied')
    }

    const backup = await this.createConfigurationBackup(component)
    await this.encryptedConfig.delete(component)

    await this.configAuditLogger.logDeletion({
      component,
      timestamp: Date.now(),
      deletedBy: authorization.userId,
      reason,
      backupId: backup.id,
      success: true,
    })
  }

  /**
   * List all configuration components
   */
  async listComponents(): Promise<string[]> {
    return this.encryptedConfig.list()
  }

  /**
   * Check if configuration exists
   */
  async hasConfiguration(component: string): Promise<boolean> {
    return this.encryptedConfig.exists(component)
  }
}
